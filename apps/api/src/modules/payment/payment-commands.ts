import { randomUUID } from 'node:crypto';
import { config } from '@deetoo/config';
import { one, rows } from '../../db/adapter';
import { withTransaction } from '../../db/transaction';
import { canonicalHash } from '../cart/quote-binding';
import { AppError } from '../../middleware/error-handler';

export interface PaymentCommand {
  id: string; payment_id: string; refund_id?: string; kind: 'INITIATE'|'VERIFY'|'VOID'|'REFUND';
  idempotency_key: string; request_hash: string; payload: Record<string, any>;
  status: string; attempts: number; lease_token?: string; last_error?: string; created_at?: string;
}
const memory = new Map<string, PaymentCommand>();
export const paymentTransaction = <T>(work: () => Promise<T>): Promise<T> => config.storage.mode === 'memory' ? work() : withTransaction(work);
export async function enqueuePaymentCommand(kind: PaymentCommand['kind'], paymentId: string, key: string, payload: Record<string, any>, refundId?: string): Promise<PaymentCommand> {
  const hash = canonicalHash(payload);
  if (config.storage.mode === 'memory') {
    const old = memory.get(key);
    if (old) {
      if (old.request_hash !== hash) throw new AppError(409,'IDEMPOTENCY_CONFLICT','Payment command changed');
      return old;
    }
    const command = {id:randomUUID(),payment_id:paymentId,refund_id:refundId,kind,idempotency_key:key,request_hash:hash,payload,status:'PENDING',attempts:0};
    memory.set(key,command); return command;
  }
  const command = await one(`INSERT INTO payment_commands(id,payment_id,refund_id,kind,idempotency_key,request_hash,payload)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
    WHERE payment_commands.request_hash=EXCLUDED.request_hash RETURNING *`,[randomUUID(),paymentId,refundId||null,kind,key,hash,payload]);
  if (!command) throw new AppError(409,'IDEMPOTENCY_CONFLICT','Payment command changed');
  return command;
}
export async function leasePaymentCommand(paymentId?:string): Promise<PaymentCommand|null> {
  const token=randomUUID();
  if (config.storage.mode === 'memory') {
    const c=[...memory.values()].find(c=>c.status==='PENDING'&&(!paymentId||c.payment_id===paymentId));
    if(!c)return null; c.status='RUNNING';c.attempts++;c.lease_token=token;return structuredClone(c);
  }
  return paymentTransaction(()=>one(`WITH candidate AS (SELECT id FROM payment_commands
    WHERE ((status='PENDING' AND available_at<=now()) OR (status='RUNNING' AND leased_until<now())) AND ($2::uuid IS NULL OR payment_id=$2)
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE payment_commands c SET status='RUNNING',attempts=attempts+1,lease_token=$1,leased_until=now()+interval '60 seconds'
    FROM candidate WHERE c.id=candidate.id RETURNING c.*`,[token,paymentId||null]));
}
export async function finishPaymentCommand(c:PaymentCommand,status:string,error?:string):Promise<void> {
  if(config.storage.mode==='memory') { const old=memory.get(c.idempotency_key);if(old?.lease_token===c.lease_token){old.status=status;}return; }
  const updated=await rows(`UPDATE payment_commands SET status=$3,last_error=$4,leased_until=NULL,
    available_at=now()+interval '30 seconds',completed_at=CASE WHEN $3='SUCCEEDED' THEN now() ELSE NULL END
    WHERE id=$1 AND lease_token=$2 RETURNING id`,[c.id,c.lease_token,status,error||null]);
  if(!updated.length)throw new Error('Payment command lease lost');
}

export function resetFixturePaymentCommands():void {
  if(config.storage.mode!=='memory'||!config.storage.fixtures)throw new Error('Fixture reset is unavailable');
  memory.clear();
}

export async function retryReviewedPaymentCommand(id:string,actorId:string):Promise<void>{
 if(config.storage.mode!=='postgres')throw new AppError(409,'DURABLE_COMMAND_REQUIRED','Recovery operates on durable payment commands');
 await paymentTransaction(async()=>{
  const actor=await one("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.status='ACTIVE' AND r.code IN ('admin','finance') LIMIT 1",[actorId]);
  if(!actor)throw new AppError(403,'FORBIDDEN_PAYMENT_RECOVERY','Active Admin or Finance required');
  const c=await one('SELECT c.*,p.provider FROM payment_commands c JOIN payments p ON p.id=c.payment_id WHERE c.id=$1 FOR UPDATE OF c',[id]);
  if(!c)throw new AppError(404,'PAYMENT_COMMAND_NOT_FOUND','Payment command not found');
  if(c.status!=='REVIEW')throw new AppError(409,'COMMAND_NOT_IN_REVIEW','Command is not awaiting review');
  if(c.provider==='MPESA'&&c.kind==='INITIATE'&&c.last_error!=='BLOCKED_BY_CONFIGURATION')throw new AppError(409,'PROVIDER_OUTCOME_UNKNOWN','An uncertain STK initiation cannot be retried blindly');
  await rows("UPDATE payment_commands SET status='PENDING',available_at=now() WHERE id=$1",[id]);
  await rows("INSERT INTO payment_timeline(id,payment_id,event_type,metadata) VALUES($1,$2,'PAYMENT_COMMAND_RETRY',$3)",[randomUUID(),c.payment_id,{actor_id:actorId,command_id:id,previous_error:c.last_error}]);
 });
}
