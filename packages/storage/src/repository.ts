import type { Account, Cashflow, ImportBatch, InstrumentProfile, Settings, Trade } from '@tc/domain';
import type { CalendarEvent } from '@tc/data-contracts';

export interface EntityMap {
  accounts: Account;
  cashflows: Cashflow;
  trades: Trade;
  profiles: InstrumentProfile;
  importBatches: ImportBatch;
  userEvents: CalendarEvent;
  meta: MetaRecord;
}
export type StoreName = keyof EntityMap;
export const STORE_NAMES: StoreName[] = ['accounts', 'cashflows', 'trades', 'profiles', 'importBatches', 'userEvents', 'meta'];

export interface MetaRecord {
  id: 'settings' | 'schemaVersion' | 'seeded';
  value: unknown;
}

export type WriteOp = { [S in StoreName]: { type: 'put'; store: S; value: EntityMap[S] } | { type: 'delete'; store: S; id: string } }[StoreName];

export interface DataSnapshot {
  accounts: Account[];
  cashflows: Cashflow[];
  trades: Trade[];
  profiles: InstrumentProfile[];
  importBatches: ImportBatch[];
  userEvents: CalendarEvent[];
  settings: Settings | null;
}

export class StorageError extends Error {
  constructor(
    public code: 'quota' | 'unavailable' | 'transaction' | 'version',
    message: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Platform-independent persistence boundary. Every multi-record change goes
 * through `commit`, which is atomic: either all operations apply or none do.
 */
export interface Repository {
  readonly kind: string;
  getAll<S extends StoreName>(store: S): Promise<EntityMap[S][]>;
  get<S extends StoreName>(store: S, id: string): Promise<EntityMap[S] | undefined>;
  commit(ops: WriteOp[]): Promise<void>;
  /** Atomically replace all data (used by restore). */
  replaceAll(snapshot: DataSnapshot): Promise<void>;
  snapshot(): Promise<DataSnapshot>;
  close(): void;
}

export const put = <S extends StoreName>(store: S, value: EntityMap[S]): WriteOp => ({ type: 'put', store, value }) as WriteOp;
export const del = (store: StoreName, id: string): WriteOp => ({ type: 'delete', store, id }) as WriteOp;

export function snapshotToOps(s: DataSnapshot): WriteOp[] {
  const ops: WriteOp[] = [];
  for (const a of s.accounts) ops.push(put('accounts', a));
  for (const c of s.cashflows) ops.push(put('cashflows', c));
  for (const t of s.trades) ops.push(put('trades', t));
  for (const p of s.profiles) ops.push(put('profiles', p));
  for (const b of s.importBatches) ops.push(put('importBatches', b));
  for (const e of s.userEvents) ops.push(put('userEvents', e));
  if (s.settings) ops.push(put('meta', { id: 'settings', value: s.settings }));
  return ops;
}
