import { dispatchOutbox } from '../apps/api/src/modules/realtime/outbox';
import { closeDbPool } from '../apps/api/src/db/client';
import { config } from '@deetoo/config';
if (config.storage.mode !== 'postgres') throw new Error('Outbox worker requires PostgreSQL');
let stopping = false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
while (!stopping) {
  try { await dispatchOutbox(); }
  catch (error) { console.error('Outbox dispatch unavailable',error instanceof Error ? error.message : error); }
  await new Promise(resolve=>setTimeout(resolve,1000));
}
await closeDbPool();
