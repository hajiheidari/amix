import { openDB, type IDBPDatabase } from 'idb';
import type { Settings } from '@tc/domain';
import { STORE_NAMES, StorageError, snapshotToOps, type DataSnapshot, type EntityMap, type Repository, type StoreName, type WriteOp } from './repository';

export const DB_NAME = 'trading-companion';
/** IndexedDB schema version. Increment and add an upgrade step for every structural change. */
export const DB_VERSION = 1;

function mapError(e: unknown): never {
  const name = e instanceof DOMException || (e && typeof e === 'object' && 'name' in e) ? String((e as { name: string }).name) : '';
  if (name === 'QuotaExceededError') throw new StorageError('quota', 'Device storage is full.');
  if (name === 'VersionError') throw new StorageError('version', 'The database was created by a newer app version.');
  if (e instanceof StorageError) throw e;
  throw new StorageError('transaction', e instanceof Error ? e.message : String(e));
}

export class IndexedDbRepository implements Repository {
  readonly kind = 'indexeddb';
  private constructor(private db: IDBPDatabase) {}

  static async open(name = DB_NAME): Promise<IndexedDbRepository> {
    if (typeof indexedDB === 'undefined') throw new StorageError('unavailable', 'IndexedDB is not available.');
    try {
      const db = await openDB(name, DB_VERSION, {
        upgrade(db, oldVersion) {
          // v0 → v1: initial schema
          if (oldVersion < 1) {
            for (const s of STORE_NAMES) db.createObjectStore(s, { keyPath: 'id' });
          }
        },
        blocked() {
          /* another tab holds an older version open; it will be asked to close */
        },
        blocking() {
          db.close();
        },
      });
      return new IndexedDbRepository(db);
    } catch (e) {
      return mapError(e);
    }
  }

  async getAll<S extends StoreName>(store: S): Promise<EntityMap[S][]> {
    try {
      return (await this.db.getAll(store)) as EntityMap[S][];
    } catch (e) {
      return mapError(e);
    }
  }
  async get<S extends StoreName>(store: S, id: string): Promise<EntityMap[S] | undefined> {
    try {
      return (await this.db.get(store, id)) as EntityMap[S] | undefined;
    } catch (e) {
      return mapError(e);
    }
  }

  async commit(ops: WriteOp[]): Promise<void> {
    if (ops.length === 0) return;
    const stores = [...new Set(ops.map((o) => o.store))];
    await this.run(stores, ops, false);
  }

  async replaceAll(s: DataSnapshot): Promise<void> {
    await this.run(STORE_NAMES, snapshotToOps(s), true);
  }

  private async run(stores: StoreName[], ops: WriteOp[], clearFirst: boolean): Promise<void> {
    const tx = this.db.transaction(stores, 'readwrite');
    const done = tx.done;
    done.catch(() => undefined); // observed below; avoid unhandled rejection after abort
    const settle = (p: Promise<unknown>) => void p.catch(() => undefined);
    try {
      if (clearFirst) for (const s of stores) settle(tx.objectStore(s).clear());
      for (const op of ops) {
        const st = tx.objectStore(op.store);
        settle(op.type === 'put' ? st.put(op.value) : st.delete(op.id));
      }
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* already aborted */
      }
      mapError(e);
    }
    try {
      await done;
    } catch (e) {
      mapError(e);
    }
  }

  async snapshot(): Promise<DataSnapshot> {
    const tx = this.db.transaction(STORE_NAMES, 'readonly');
    const [accounts, cashflows, trades, profiles, importBatches, userEvents, settings] = await Promise.all([
      tx.objectStore('accounts').getAll(),
      tx.objectStore('cashflows').getAll(),
      tx.objectStore('trades').getAll(),
      tx.objectStore('profiles').getAll(),
      tx.objectStore('importBatches').getAll(),
      tx.objectStore('userEvents').getAll(),
      tx.objectStore('meta').get('settings'),
    ]);
    await tx.done;
    return { accounts, cashflows, trades, profiles, importBatches, userEvents, settings: (settings?.value as Settings | undefined) ?? null };
  }

  close(): void {
    this.db.close();
  }
}
