import { recoverPaymentWork } from '../apps/api/src/modules/payment/payment-recovery';
import { processPaymentCommand } from '../apps/api/src/modules/payment/payment-worker';
import { closeDbPool } from '../apps/api/src/db/client';
import { config } from '@deetoo/config';
if(config.storage.mode!=='postgres')throw new Error('Payment worker requires PostgreSQL');
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
let lastRecovery=0;
while(!stopping){
  if(Date.now()-lastRecovery>30000){
    try{await recoverPaymentWork();lastRecovery=Date.now();}catch{console.error('Payment recovery scan unavailable');}
  }
  try { if(await processPaymentCommand())continue; } catch { console.error('Payment worker unavailable; durable work remains queued'); }
  await new Promise(resolve=>setTimeout(resolve,1000));
}
await closeDbPool();
