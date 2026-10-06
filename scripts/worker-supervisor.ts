import { spawn, ChildProcess } from 'node:child_process';
import { logger } from '@deetoo/utils';

const workerScripts = [
  'worker:payments',
  'worker:dispatch',
  'worker:notifications',
  'worker:outbox',
  'worker:automation',
] as const;

let stopping = false;
const children = new Map<string, ChildProcess>();

function commandName(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function startWorker(script: string): void {
  if (stopping) return;

  const child = spawn(commandName(), [script], {
    stdio: 'inherit',
    env: process.env,
  });
  children.set(script, child);

  logger.info('Started supervised worker', {
    service: 'worker-supervisor',
    metadata: { script, pid: child.pid },
  });

  child.once('exit', (code, signal) => {
    children.delete(script);
    if (stopping) return;

    logger.error('Supervised worker exited; restarting', {
      service: 'worker-supervisor',
      metadata: { script, code, signal },
    });

    setTimeout(() => startWorker(script), 2_000);
  });
}

function shutdown(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;

  logger.info('Stopping supervised workers', {
    service: 'worker-supervisor',
    metadata: { signal, workers: Array.from(children.keys()) },
  });

  for (const child of children.values()) {
    if (!child.killed) child.kill(signal);
  }

  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

for (const script of workerScripts) startWorker(script);
