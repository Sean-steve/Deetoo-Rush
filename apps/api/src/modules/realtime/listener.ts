import { getDbPool } from '../../db/client';
import { orderEventBroker } from './event-broker';
import { config } from '@deetoo/config';
import type { PoolClient } from 'pg';

/** PostgreSQL notifications fan out committed invalidations to every API process.
 * Disconnections use the authenticated /events endpoint or canonical REST reload. */
export function startRealtimeListener(): () => Promise<void> {
  if (config.storage.mode === 'memory') return async()=>{};
  let stopped=false;
  let client:PoolClient|undefined;
  let retry:NodeJS.Timeout|undefined;
  const reconnect=()=>{
    client?.release(true); client=undefined;
    if (!stopped && !retry) retry=setTimeout(()=>{retry=undefined;void connect();},1000);
  };
  const connect=async()=>{
    try {
      const connection=await getDbPool().connect();
      if(stopped){connection.release();return;}
      client=connection;
      connection.on('error',reconnect);
      connection.on('notification',async message=>{
        if(message.channel!=='deetoo_events'||!message.payload)return;
        try {
          const result=await connection.query('SELECT payload FROM outbox_events WHERE id=$1 AND published_at IS NOT NULL',[message.payload]);
          if(result.rows[0])await orderEventBroker.deliver(result.rows[0].payload);
        } catch { reconnect(); }
      });
      await connection.query('LISTEN deetoo_events');
    } catch { reconnect(); }
  };
  void connect();
  return async()=>{stopped=true;if(retry)clearTimeout(retry);client?.release(true);client=undefined;};
}
