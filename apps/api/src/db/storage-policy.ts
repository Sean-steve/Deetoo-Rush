import { config } from '@deetoo/config';
import { AppError } from '../middleware/error-handler';

/** Memory is a deliberately selected adapter, never a response to database failure. */
export function allowMemoryAdapter(): void {
  if (config.storage.mode !== 'memory') {
    throw new AppError(503, 'DURABLE_STORAGE_REQUIRED', 'Durable storage is unavailable for this operation');
  }
}
export function requireSimulationMode(): void {
  if (config.storage.mode !== 'memory' || !config.storage.fixtures) {
    throw new AppError(503, 'INTEGRATION_NOT_CONFIGURED', 'This integration has no configured production adapter');
  }
}
