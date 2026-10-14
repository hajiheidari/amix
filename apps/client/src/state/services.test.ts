import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ILLUSTRATIVE_PROFILES } from '@tc/domain';
import { summarizeTrade } from '@tc/journal';
import { MemoryRepository, put } from '@tc/storage';
import { commitImport, deleteAccountCascade, deleteTrade, demoData, saveProfile, seedIfNeeded, undoImport } from './services';
import { accountUSD, cashflows, trades } from '../../../../tests/fixtures/reference-ledger';

describe('services', () => {
  it('seeds once', async () => {
    const r = new MemoryRepository();
    expect(await seedIfNeeded(r)).toBe(true);
    expect(await seedIfNeeded(r)).toBe(false);
    expect((await r.getAll('profiles')).length).toBe(ILLUSTRATIVE_PROFILES.length);
  });

  it('import is transactional: a failure leaves no partial batch', async () => {
    const r = new MemoryRepository();
    await r.commit([put('accounts', accountUSD)]);
    r.failOnOp = 3;
    await expect(commitImport(r, { id: 'b1', kind: 'trades_csv', fileName: 'x.csv', createdAt: '2026-01-01T00:00:00Z' }, trades.slice(0, 5))).rejects.toThrow();
    expect(await r.getAll('trades')).toEqual([]);
    expect(await r.getAll('importBatches')).toEqual([]);
  });

  it('batch undo removes exactly the imported trades', async () => {
    const r = new MemoryRepository();
    await r.commit([put('accounts', accountUSD), put('trades', { ...trades[0]!, id: 'manual' })]);
    await commitImport(r, { id: 'b1', kind: 'trades_csv', fileName: 'x.csv', createdAt: '2026-01-01T00:00:00Z' }, trades.slice(1, 4));
    expect((await r.getAll('trades')).length).toBe(4);
    expect(await undoImport(r, 'b1')).toBe(3);
    expect((await r.getAll('trades')).map((t) => t.id)).toEqual(['manual']);
    expect((await r.get('importBatches', 'b1'))?.undone).toBe(true);
    expect(await undoImport(r, 'b1')).toBe(0);
  });

  it('delete + undo restores the trade', async () => {
    const r = new MemoryRepository();
    await r.commit([put('trades', trades[0]!)]);
    const undo = await deleteTrade(r, trades[0]!.id);
    expect(await r.get('trades', trades[0]!.id)).toBeUndefined();
    await r.commit(undo);
    expect(await r.get('trades', trades[0]!.id)).toEqual(trades[0]);
  });

  it('editing a profile never rewrites historical trade results', async () => {
    const r = new MemoryRepository();
    await seedIfNeeded(r);
    await r.commit([put('accounts', accountUSD), put('trades', trades[1]!)]); // gold trade, 100 oz/lot snapshot
    const before = summarizeTrade((await r.get('trades', 'T2'))!, 'USD').net!.toFixed();
    const gold = (await r.get('profiles', 'ex-xauusd'))!;
    const saved = await saveProfile(r, { ...gold, contractMultiplier: '10' }, false);
    expect(saved.version).toBe(2);
    expect(summarizeTrade((await r.get('trades', 'T2'))!, 'USD').net!.toFixed()).toBe(before);
  });

  it('account delete cascades and clears the default account', async () => {
    const r = new MemoryRepository();
    await r.commit([put('accounts', accountUSD), ...trades.filter((t) => t.accountId === 'acc-usd').map((t) => put('trades', t)), ...cashflows.map((c) => put('cashflows', c))]);
    await deleteAccountCascade(r, 'acc-usd', { ...DEFAULT_SETTINGS, defaultAccountId: 'acc-usd' });
    expect(await r.getAll('trades')).toEqual([]);
    expect(await r.getAll('cashflows')).toEqual([]);
    expect(((await r.get('meta', 'settings'))!.value as { defaultAccountId: string | null }).defaultAccountId).toBeNull();
  });

  it('demo data is labeled and computable', () => {
    const d = demoData(new Date('2026-10-14T00:00:00Z'));
    expect(d.account.name).toMatch(/Demo/);
    for (const t of d.trades) expect(summarizeTrade(t, 'USD').net).not.toBeNull();
  });
});
