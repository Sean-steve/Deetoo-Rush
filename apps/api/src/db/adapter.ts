import { config } from '@deetoo/config';
import { AppError } from '../middleware/error-handler';
import { getDbPool } from './client';

export function storageAdapter<T extends object>(fixture: T, durable: Partial<Record<keyof T, Function>>): T {
  return new Proxy(fixture, {
    get(target, key) {
      const value = Reflect.get(target,key);
      if (config.storage.mode === 'memory') return typeof value === 'function' ? value.bind(target) : value;
      const implementation = durable[key as keyof T];
      if (implementation) return implementation.bind(durable);
      if (typeof value === 'function') return async () => { throw new AppError(503,'DURABLE_OPERATION_UNAVAILABLE','This operation has no verified durable adapter'); };
      throw new AppError(503,'DURABLE_OPERATION_UNAVAILABLE','Direct in-memory storage access is not allowed');
    },
  });
}
export async function rows(sql:string, values:unknown[]=[]):Promise<any[]> {
  return (await getDbPool().query(sql,values)).rows.map(row => {
    for (const field of ['latitude','longitude']) if (row[field] != null) row[field]=Number(row[field]);
    return JSON.parse(JSON.stringify(row));
  });
}
export async function one(sql:string,values:unknown[]=[]):Promise<any|null> { return (await rows(sql,values))[0] || null; }
export function identifier(name:string) { if (!/^[a-z_][a-z_0-9]*$/.test(name)) throw new Error('Invalid SQL identifier'); return '"'+name+'"'; }
export async function insert(table:string,data:Record<string,unknown>,allowed:string[]) {
  const keys=allowed.filter(k=>data[k]!==undefined);
  return one(`INSERT INTO ${identifier(table)} (${keys.map(identifier).join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,keys.map(k=>data[k]));
}
