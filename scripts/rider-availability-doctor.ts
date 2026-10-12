/**
 * Read-only check for the Go Online prerequisites used by the Rider app.
 * Does not create a rider session, alter availability, or expose credentials.
 * Usage: pnpm rider:doctor
 */
import {config} from '@deetoo/config';
import {getDbPool,closeDbPool} from '../apps/api/src/db/client';
import {readyRedis,closeRedisClient} from '../apps/api/src/db/redis';

const necessary=['rider_profiles','rider_vehicles','rider_service_zones','rider_availability_sessions','service_zones'];
const failure=(error:unknown)=>error instanceof Error?error.message:String(error);
async function main(){
 console.log('DeeToo Rider availability prerequisites (read-only)');
 console.log('Storage mode:',config.storage.mode);
 if(config.storage.mode!=='postgres'){
   console.error('FAIL: Live Rider availability requires DEETOO_STORAGE_MODE=postgres.');
   process.exitCode=1;
   return;
 }
 try{
  const result=await getDbPool().query(
   'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',
   [necessary]);
  const found=new Set(result.rows.map(row=>String(row.table_name)));
  const missing=necessary.filter(t=>!found.has(t));
  if(missing.length){console.error('PostgreSQL: CONNECTED, missing Rider tables:',missing.join(', '));process.exitCode=1;}
  else console.log('PostgreSQL: CONNECTED; Rider schema tables present.');
 }catch(error){
  console.error('PostgreSQL: UNAVAILABLE —',failure(error));
  console.error('Check DATABASE_URL and the PostgreSQL password; then run pnpm db:status and apply pending migrations.');
  process.exitCode=1;
 }
 try{
  const redis=await readyRedis();
  if(await redis.ping()!=='PONG')throw new Error('Redis PING did not return PONG');
  console.log('Redis: CONNECTED; rider GPS and shared dispatch index available.');
 }catch(error){
  console.error('Redis: UNAVAILABLE —',failure(error));
  console.error('Start Redis with docker compose up -d redis. Verify with docker exec deetoo-redis redis-cli ping.');
  console.error('Check REDIS_URL. For host-run pnpm dev:api the default is redis://127.0.0.1:6379.');
  process.exitCode=1;
 }
 if(!process.exitCode)console.log('Core storage prerequisites are ready. Rider approval, vehicle, coverage and GPS permissions still apply.');
}
void main().finally(async()=>{closeRedisClient();await closeDbPool();});
