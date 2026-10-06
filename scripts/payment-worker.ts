import { recoverPaymentWork } from '../apps/api/src/modules/payment/payment-recovery';
import { processPaymentCommand } from '../apps/api/src/modules/payment/payment-worker';
import { closeDbPool } from '../apps/api/src/db/client';
import { config } from '@deetoo/config';
import { logger } from '@deetoo/utils';
if(config.storage.mode!=='postgres')throw new Error('Payment worker requires PostgreSQL');
logger.info('Payment worker started', {
  service: 'payment-worker',
  metadata: {
    storageMode: config.storage.mode,
    localWorkflow: config.localWorkflow,
    environment: config.environment,
  },
});
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
let lastRecovery=0;
while(!stopping){
  if(Date.now()-lastRecovery>30000){
    try{
      await recoverPaymentWork();
      lastRecovery=Date.now();
    }catch(error){
      logger.error('Payment recovery scan unavailable', {
        service: 'payment-worker',
        error,
        metadata: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  try {
    if(await processPaymentCommand()) continue;
  } catch(error) {
    logger.error('Payment worker unavailable; durable work remains queued', {
      service: 'payment-worker',
      error,
      metadata: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
  await new Promise(resolve=>setTimeout(resolve,1000));
}
await closeDbPool();
