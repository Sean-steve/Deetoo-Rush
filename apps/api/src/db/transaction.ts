import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';
import { config } from '@deetoo/config';
import { getDbPool } from './client';

const rollbackActions = new WeakMap<PoolClient, Array<() => Promise<unknown>>>();
export function onTransactionRollback(work: () => Promise<unknown>): void {
  const client = currentTransaction();
  if (client) rollbackActions.get(client)?.push(work);
}

const context = new AsyncLocalStorage<PoolClient>();
export const currentTransaction = () => context.getStore();
/** Security denial audit must survive rollback of the rejected command. */
export const outsideTransaction = <T>(work: () => Promise<T>): Promise<T> => context.exit(work);

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const existing = context.getStore();
  if (existing) return work(existing);
  const client = await getDbPool().connect();
  try {
    rollbackActions.set(client, []);
    await client.query('BEGIN');
    const result = await context.run(client, () => work(client));
    const committed = await client.query('COMMIT');
    if (committed.command !== 'COMMIT') throw new Error('Transaction was aborted; no durable mutation was committed');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    for (const action of rollbackActions.get(client) || []) await outsideTransaction(action);
    throw error;
  } finally { rollbackActions.delete(client); client.release(); }
}

/** Keep a service command and all repository/outbox writes in one transaction. */
export function transactionalService<T extends object>(service: T): T {
  return new Proxy(service, {
    get(target, key) {
      const member = Reflect.get(target,key);
      if (typeof member !== 'function') return member;
      if (member.constructor.name !== 'AsyncFunction') return member.bind(target);
      return (...args: unknown[]) => config.storage.mode === 'memory'
        ? member.apply(target,args)
        : withTransaction(() => member.apply(target,args));
    },
  });
}
