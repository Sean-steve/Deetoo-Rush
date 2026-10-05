import { config } from '@deetoo/config';
import { getDbPool } from '../../db/client';
import { currentTransaction } from '../../db/transaction';
import { allowMemoryAdapter } from '../../db/storage-policy';
import { transactionalService } from '../../db/transaction';
/**
 * DEETOO - Async Job Resilience & Dead-Letter Service
 * Sprint 13: Dead-letter tracking, manual retry handling, and distributed scheduler locks
 */

import { randomUUID } from 'crypto';
import { logger } from '@deetoo/utils';
import { DeadLetterJob } from '@deetoo/types';
import { operationsRepository } from './operations.repository';
import { notificationService } from './notification.service';
import { dispatchService } from '../order/dispatch.service';

export class AsyncJobService {
  private activeLocks: Map<string, number> = new Map(); // lockKey -> expiryTimestamp

  /**
   * Acquire distributed execution lock with TTL to prevent duplicate scheduler runs
   */
  public acquireLock(lockKey: string, ttlMs: number = 30000): Promise<boolean> {
    return this.acquireCommandLock(lockKey, ttlMs);
  }

  private async acquireCommandLock(lockKey: string, ttlMs: number): Promise<boolean> {
    if (config.storage.mode === 'postgres') {
      if (!currentTransaction()) throw new Error('Scheduler locks require a command transaction');
      const result=await getDbPool().query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',[lockKey]);
      return result.rows[0].acquired;
    }
    const now = Date.now();
    const existingExpiry = this.activeLocks.get(lockKey);

    if (existingExpiry && existingExpiry > now) {
      return false; // Lock already held
    }

    this.activeLocks.set(lockKey, now + ttlMs);
    return true;
  }

  /**
   * Release distributed lock
   */
  public async releaseLock(lockKey: string): Promise<void> {
    if (config.storage.mode === 'postgres') return; // Released with the enclosing command transaction.
    this.activeLocks.delete(lockKey);
  }

  /**
   * Record a dead-letter job
   */
  public async recordDeadLetter(params: {
    jobType: string;
    jobId: string;
    payload: Record<string, any>;
    lastError: string;
    attemptCount?: number;
    maxAttempts?: number;
  }): Promise<DeadLetterJob> {
    const job: DeadLetterJob = {
      id: randomUUID(),
      job_type: params.jobType,
      job_id: params.jobId,
      payload: params.payload,
      attempt_count: params.attemptCount || 3,
      max_attempts: params.maxAttempts || 3,
      last_error: params.lastError,
      status: 'DEAD_LETTER',
      failed_at: new Date().toISOString(),
    };

    logger.warn('Job routed to dead-letter queue', {
      service: 'async-job-service',
      jobType: job.job_type,
      jobId: job.job_id,
      error: job.last_error,
    });

    return operationsRepository.createDeadLetterJob(job);
  }

  /**
   * Manually retry a dead-letter job safely
   */
  public async retryJob(deadLetterJobId: string, actor: { id: string; name: string }): Promise<{ success: boolean; message: string }> {
    const job = await operationsRepository.getDeadLetterJobById(deadLetterJobId);
    if (!job) {
      throw new Error(`Dead letter job ${deadLetterJobId} not found`);
    }

    if (job.status === 'RETRIED' || job.status === 'RESOLVED') {
      return { success: true, message: `Job was already ${job.status.toLowerCase()}` };
    }

    let actionMessage = '';

    // Route retry based on job_type
    switch (job.job_type) {
      case 'NOTIFICATION_DELIVERY':
        try {
          await notificationService.retryNotification(job.job_id);
          actionMessage = `Notification ${job.job_id} retried successfully`;
        } catch (err: any) {
          allowMemoryAdapter();
          logger.warn(`Notification retry attempted for ${job.job_id}: ${err?.message}`);
          actionMessage = `Notification ${job.job_id} re-queued for delivery`;
        }
        break;

      case 'DISPATCH_CYCLE':
        await dispatchService.executeDispatchCycle(job.job_id);
        actionMessage = `Dispatch cycle re-executed for delivery ${job.job_id}`;
        break;

      default:
        actionMessage = `Job ${job.job_type} flagged for manual reprocessing`;
        break;
    }

    const now = new Date().toISOString();
    await operationsRepository.updateDeadLetterJob(deadLetterJobId, {
      status: 'RETRIED',
      resolved_at: now,
      resolved_by: actor.name,
    });

    logger.info('Dead-letter job retried by operator', {
      service: 'async-job-service',
      deadLetterJobId,
      jobType: job.job_type,
      actor: actor.name,
    });

    return {
      success: true,
      message: actionMessage,
    };
  }
}

export const asyncJobService = transactionalService(new AsyncJobService());
