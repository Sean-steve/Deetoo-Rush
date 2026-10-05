import { config } from '@deetoo/config';
import { rows } from '../../db/adapter';
import { paymentTransaction, enqueuePaymentCommand } from './payment-commands';
import { paymentProviderRegistry } from './providers/provider-registry';
import { paymentRepository } from './payment.repository';
import { paymentService } from './payment.service';

/** Repeatable scans recover callback-before-initiation and missing callback delivery. */
export async function recoverPaymentWork():Promise<void>{
 if(config.storage.mode!=='postgres')return;
 await paymentTransaction(async()=>{
  const unmatched=await rows("SELECT * FROM payment_provider_events WHERE payment_id IS NULL AND processing_status='RECEIVED' ORDER BY received_at LIMIT 100 FOR UPDATE SKIP LOCKED");
  for(const event of unmatched){
   const parsed=paymentProviderRegistry.getProvider(event.provider).parseCallback(event.raw_payload);
   if(!parsed.isValid)continue;
   let p=parsed.checkoutRequestId?await paymentRepository.findPaymentByCheckoutRequestId(parsed.checkoutRequestId):null;
   if(!p&&parsed.providerReference)p=await paymentRepository.findPaymentByProviderReference(event.provider,parsed.providerReference);
   if(p&&p.provider===event.provider){
    await rows('UPDATE payment_provider_events SET payment_id=$2 WHERE id=$1 AND payment_id IS NULL',[event.id,p.id]);
    await enqueuePaymentCommand('VERIFY',p.id,`verify:${event.provider}:${event.provider_event_id}`,{callback:parsed,eventId:event.provider_event_id});
   }
  }
  const pending=await rows(`SELECT id FROM payments p WHERE p.captured_minor=0 AND p.provider_payment_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM payment_commands c WHERE c.payment_id=p.id AND c.kind='VERIFY' AND c.status IN ('PENDING','RUNNING','REVIEW'))
    ORDER BY p.updated_at LIMIT 100`);
  const bucket=Math.floor(Date.now()/60000);
  for(const p of pending)await enqueuePaymentCommand('VERIFY',p.id,`scheduled-verification:${p.id}:${bucket}`,{});
 });
}
