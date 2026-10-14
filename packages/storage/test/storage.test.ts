import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ILLUSTRATIVE_PROFILES } from '@tc/domain';
import { BACKUP_VERSION, IndexedDbRepository, MemoryRepository, createBackup, del, parseBackup, put, type Repository } from '../src';
import { accountEUR, accountUSD, cashflows, trades } from '../../../tests/fixtures/reference-ledger';

async function seed(r: Repository) {
  await r.commit([
    put('accounts', accountUSD), put('accounts', accountEUR),
    ...cashflows.map((c) => put('cashflows', c)),
    ...trades.map((t) => put('trades', t)),
    ...ILLUSTRATIVE_PROFILES.map((p) => put('profiles', p)),
    put('meta', { id: 'settings', value: { ...DEFAULT_SETTINGS, language: 'fa' } }),
  ]);
}

let dbn = 0;
const repos: [string, () => Promise<Repository>][] = [
  ['memory', async () => new MemoryRepository()],
  ['indexeddb', async () => IndexedDbRepository.open(`test-db-${++dbn}`)],
];

describe.each(repos)('%s repository', (_name, make) => {
  it('persists and reads back', async () => {
    const r = await make();
    await seed(r);
    expect((await r.getAll('trades')).length).toBe(trades.length);
    expect((await r.get('accounts', 'acc-usd'))?.name).toBe('Demo USD');
  });

  it('commit is atomic (failure rolls back everything)', async () => {
    const r = await make();
    await seed(r);
    const bad = { ...trades[0]!, id: undefined } as unknown as typeof trades[0]; // missing key → IDB DataError
    const before = (await r.getAll('trades')).length;
    if (r instanceof MemoryRepository) r.failOnOp = 1;
    await expect(r.commit([put('trades', { ...trades[0]!, id: 'NEW' }), put('trades', bad), del('trades', 'T1')])).rejects.toThrow();
    expect((await r.getAll('trades')).length).toBe(before);
    expect(await r.get('trades', 'NEW')).toBeUndefined();
    expect(await r.get('trades', 'T1')).toBeDefined();
  });

  it('backup → restore round trip is lossless', async () => {
    const r = await make();
    await seed(r);
    const snap = await r.snapshot();
    const json = createBackup(snap, '0.1.0', new Date('2026-10-14T00:00:00Z'));
    const parsed = parseBackup(json);
    if (!parsed.ok) throw new Error(parsed.code);
    const r2 = await make();
    await r2.commit([put('accounts', { ...accountUSD, id: 'stale', name: 'will be replaced' })]);
    await r2.replaceAll(parsed.value.snapshot);
    const snap2 = await r2.snapshot();
    expect(await r2.get('accounts', 'stale')).toBeUndefined();
    const sortById = <T extends { id: string }>(a: T[]) => a.slice().sort((x, y) => x.id.localeCompare(y.id));
    expect(sortById(snap2.trades)).toEqual(sortById(snap.trades));
    expect(sortById(snap2.accounts)).toEqual(sortById(snap.accounts));
    expect(sortById(snap2.cashflows)).toEqual(sortById(snap.cashflows));
    expect(snap2.settings?.language).toBe('fa');
  });
});

describe('backup validation', () => {
  it('rejects non-JSON, wrong format, newer versions and broken references', async () => {
    expect(parseBackup('nope')).toMatchObject({ ok: false, code: 'backup.notJson' });
    expect(parseBackup('{"format":"x"}')).toMatchObject({ ok: false, code: 'backup.wrongFormat' });
    expect(parseBackup(JSON.stringify({ format: 'trading-companion-backup', version: BACKUP_VERSION + 1, data: {} }))).toMatchObject({ ok: false, code: 'backup.newerVersion' });
    const orphan = { format: 'trading-companion-backup', version: 1, data: { accounts: [], trades: [{ ...trades[0], accountId: 'missing' }] } };
    expect(parseBackup(JSON.stringify(orphan))).toMatchObject({ ok: false, code: 'backup.invalidRecord' });
    const dup = { format: 'trading-companion-backup', version: 1, data: { accounts: [accountUSD, accountUSD] } };
    expect(parseBackup(JSON.stringify(dup))).toMatchObject({ ok: false, code: 'backup.duplicateId' });
  });
  it('fills defaults for settings fields missing from older payloads', () => {
    const p = parseBackup(JSON.stringify({ format: 'trading-companion-backup', version: 1, data: { accounts: [], settings: { language: 'ar' } } }));
    if (!p.ok) throw new Error(p.code);
    expect(p.value.snapshot.settings?.language).toBe('ar');
    expect(p.value.snapshot.settings?.widgets.length).toBe(DEFAULT_SETTINGS.widgets.length);
    expect(p.value.snapshot.trades).toEqual([]);
  });
  it('handles Persian/Arabic text in a round trip', () => {
    const s = { accounts: [{ ...accountUSD, name: 'حساب اصلی', notes: 'ملاحظة: اختبار' }], cashflows: [], trades: [], profiles: [], importBatches: [], userEvents: [], settings: null };
    const p = parseBackup(createBackup(s, '0.1.0'));
    if (!p.ok) throw new Error(p.code);
    expect(p.value.snapshot.accounts[0]!.name).toBe('حساب اصلی');
  });
});
