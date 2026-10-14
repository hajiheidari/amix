import { STORE_NAMES, StorageError, snapshotToOps, type DataSnapshot, type EntityMap, type Repository, type StoreName, type WriteOp } from './repository';
import type { Settings } from '@tc/domain';

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory repository with the same atomic semantics; used by tests. */
export class MemoryRepository implements Repository {
  readonly kind = 'memory';
  private data = new Map<StoreName, Map<string, unknown>>(STORE_NAMES.map((s) => [s, new Map()]));
  /** Test hook: throw on the n-th operation of the next commit. */
  failOnOp: number | null = null;

  async getAll<S extends StoreName>(store: S): Promise<EntityMap[S][]> {
    return [...this.data.get(store)!.values()].map((v) => clone(v)) as EntityMap[S][];
  }
  async get<S extends StoreName>(store: S, id: string): Promise<EntityMap[S] | undefined> {
    const v = this.data.get(store)!.get(id);
    return v === undefined ? undefined : (clone(v) as EntityMap[S]);
  }
  async commit(ops: WriteOp[]): Promise<void> {
    const next = new Map([...this.data].map(([k, m]) => [k, new Map(m)]));
    ops.forEach((op, i) => {
      if (this.failOnOp !== null && i === this.failOnOp) {
        this.failOnOp = null;
        throw new StorageError('transaction', 'Injected failure');
      }
      const m = next.get(op.store)!;
      if (op.type === 'put') m.set((op.value as { id: string }).id, clone(op.value));
      else m.delete(op.id);
    });
    this.data = next;
  }
  async replaceAll(s: DataSnapshot): Promise<void> {
    const backup = this.data;
    this.data = new Map(STORE_NAMES.map((n) => [n, new Map()]));
    try {
      await this.commit(snapshotToOps(s));
    } catch (e) {
      this.data = backup;
      throw e;
    }
  }
  async snapshot(): Promise<DataSnapshot> {
    const settings = (await this.get('meta', 'settings'))?.value as Settings | undefined;
    return {
      accounts: await this.getAll('accounts'),
      cashflows: await this.getAll('cashflows'),
      trades: await this.getAll('trades'),
      profiles: await this.getAll('profiles'),
      importBatches: await this.getAll('importBatches'),
      userEvents: await this.getAll('userEvents'),
      settings: settings ?? null,
    };
  }
  close(): void {}
}
