import { randomUUID } from 'node:crypto';
import { getDbPool } from '../../db/client';
import { currentTransaction, withTransaction } from '../../db/transaction';
import type { RealtimeOrderEvent } from '@deetoo/types';

export async function enqueueEvent(channel: string, event: RealtimeOrderEvent): Promise<string> {
  if (!currentTransaction()) throw new Error('Domain events require an enclosing transaction');
  const id = randomUUID();
  const orderId = event.order_id || event.orderId;
  const aggregateId = /^[0-9a-f-]{36}$/i.test(orderId || '') ? orderId : id;
  // Realtime messages are invalidations, not private snapshots. Sensitive data stays in scoped REST APIs.
  const payload = { id, type:event.type, channel, order_id:orderId, status:event.status, timestamp:event.timestamp };
  await getDbPool().query(`INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,payload,channel)
    VALUES($1,'REALTIME',$2,$3,$4,$5)`, [id,aggregateId,event.type,JSON.stringify(payload),channel]);
  return id;
}

/** Leases survive worker crashes; a lost lease cannot acknowledge another worker's work. */
export async function dispatchOutbox(limit = 50, dispatch?: (event:any) => Promise<void>): Promise<number> {
  const token = randomUUID();
  const result = await getDbPool().query(`WITH pending AS (
    SELECT id FROM outbox_events WHERE published_at IS NULL AND available_at<=now()
      AND (leased_until IS NULL OR leased_until<now()) ORDER BY occurred_at,id
      LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE outbox_events e SET lease_token=$2,leased_until=now()+interval '30 seconds',attempts=attempts+1
      FROM pending WHERE e.id=pending.id RETURNING e.id,e.payload`,[limit,token]);
  let completed = 0;
  for (const event of result.rows) {
    try {
      const published = await withTransaction(async client => {
        const lock = await client.query('SELECT id FROM outbox_events WHERE id=$1 AND lease_token=$2 AND published_at IS NULL FOR UPDATE',[event.id,token]);
        if (!lock.rowCount) return;
        if (dispatch) await dispatch(event.payload);
        else await client.query("SELECT pg_notify('deetoo_events',$1)",[event.id]);
        await client.query('UPDATE outbox_events SET published_at=now(),lease_token=NULL,leased_until=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2',[event.id,token]);
        return true;
      });
      if (published) completed++;
    } catch (error) {
      await getDbPool().query(`UPDATE outbox_events SET lease_token=NULL,leased_until=NULL,
        last_error=$3,available_at=now()+least(attempts,60)*interval '1 second' WHERE id=$1 AND lease_token=$2`,
        [event.id,token,error instanceof Error ? error.message.slice(0,1000) : 'Dispatch failure']);
    }
  }
  return completed;
}

export async function readChannelEvents(channel:string,since?:string) {
  const result = await getDbPool().query(`SELECT payload FROM outbox_events WHERE channel=$1
    AND ($2::timestamptz IS NULL OR occurred_at>$2) ORDER BY occurred_at DESC,id DESC LIMIT 100`,[channel,since||null]);
  return result.rows.reverse().map(row=>row.payload);
}
