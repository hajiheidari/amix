import { DEFAULT_SETTINGS, ILLUSTRATIVE_PROFILES, mergeSettings, newId, nowIso, type Account, type Cashflow, type ImportBatch, type InstrumentProfile, type Settings, type Trade } from '@tc/domain';
import { computeInitialRisk, tradeFingerprint } from '@tc/journal';
import { del, put, type Repository, type WriteOp } from '@tc/storage';

export async function loadSettings(repo: Repository): Promise<Settings> {
  const m = await repo.get('meta', 'settings');
  return mergeSettings((m?.value as Partial<Settings> | undefined) ?? null);
}

export function saveSettingsOp(s: Settings): WriteOp {
  return put('meta', { id: 'settings', value: s });
}

/** First run: store illustrative profiles and default settings in one transaction. */
export async function seedIfNeeded(repo: Repository, initial: Partial<Settings> = {}): Promise<boolean> {
  const seeded = await repo.get('meta', 'seeded');
  if (seeded) return false;
  await repo.commit([
    ...ILLUSTRATIVE_PROFILES.map((p) => put('profiles', p)),
    saveSettingsOp({ ...DEFAULT_SETTINGS, ...initial, favoriteProfileIds: ILLUSTRATIVE_PROFILES.filter((p) => p.favorite).map((p) => p.id) }),
    put('meta', { id: 'seeded', value: nowIso() }),
  ]);
  return true;
}

/** Normalize derived fields and persist a trade. */
export function prepareTrade(t: Trade): Trade {
  const withRisk = t.initialRisk && t.initialRisk.trim() !== '' ? t : { ...t, initialRisk: computeInitialRisk(t)?.toFixed() ?? null };
  return { ...withRisk, fingerprint: tradeFingerprint(withRisk), updatedAt: nowIso() };
}

export async function saveTrade(repo: Repository, t: Trade): Promise<Trade> {
  const p = prepareTrade(t);
  await repo.commit([put('trades', p)]);
  return p;
}

/** Delete a trade; returns the ops that undo the deletion. */
export async function deleteTrade(repo: Repository, id: string): Promise<WriteOp[]> {
  const prev = await repo.get('trades', id);
  await repo.commit([del('trades', id)]);
  return prev ? [put('trades', prev)] : [];
}

export async function saveAccount(repo: Repository, a: Account): Promise<void> {
  await repo.commit([put('accounts', { ...a, updatedAt: nowIso() })]);
}

export async function deleteAccountCascade(repo: Repository, accountId: string, settings: Settings): Promise<void> {
  const trades = (await repo.getAll('trades')).filter((t) => t.accountId === accountId);
  const flows = (await repo.getAll('cashflows')).filter((c) => c.accountId === accountId);
  const ops: WriteOp[] = [del('accounts', accountId), ...trades.map((t) => del('trades', t.id)), ...flows.map((c) => del('cashflows', c.id))];
  if (settings.defaultAccountId === accountId) ops.push(saveSettingsOp({ ...settings, defaultAccountId: null }));
  await repo.commit(ops);
}

export async function saveCashflow(repo: Repository, c: Cashflow): Promise<void> {
  await repo.commit([put('cashflows', { ...c, updatedAt: nowIso() })]);
}

export async function deleteCashflow(repo: Repository, id: string): Promise<WriteOp[]> {
  const prev = await repo.get('cashflows', id);
  await repo.commit([del('cashflows', id)]);
  return prev ? [put('cashflows', prev)] : [];
}

/** Save a profile, bumping its version. Trades keep their own snapshot and are not touched. */
export async function saveProfile(repo: Repository, p: InstrumentProfile, isNew: boolean): Promise<InstrumentProfile> {
  const now = nowIso();
  const next = { ...p, version: isNew ? 1 : p.version + 1, updatedAt: now, createdAt: isNew ? now : p.createdAt };
  await repo.commit([put('profiles', next)]);
  return next;
}

/** Commit an import batch atomically: all trades + the batch record, or nothing. */
export async function commitImport(repo: Repository, batch: Omit<ImportBatch, 'tradeIds' | 'cashflowIds' | 'undone'>, trades: Trade[]): Promise<ImportBatch> {
  const b: ImportBatch = { ...batch, tradeIds: trades.map((t) => t.id), cashflowIds: [], undone: false };
  await repo.commit([...trades.map((t) => put('trades', { ...t, importBatchId: b.id })), put('importBatches', b)]);
  return b;
}

/** Remove everything a batch created, atomically. Trades edited since import are still removed (they belong to the batch). */
export async function undoImport(repo: Repository, batchId: string): Promise<number> {
  const b = await repo.get('importBatches', batchId);
  if (!b || b.undone) return 0;
  const existing = new Set((await repo.getAll('trades')).map((t) => t.id));
  const ids = b.tradeIds.filter((id) => existing.has(id));
  await repo.commit([...ids.map((id) => del('trades', id)), ...b.cashflowIds.map((id) => del('cashflows', id)), put('importBatches', { ...b, undone: true })]);
  return ids.length;
}

export async function eraseAll(repo: Repository): Promise<void> {
  await repo.replaceAll({ accounts: [], cashflows: [], trades: [], profiles: [], importBatches: [], userEvents: [], settings: null });
}

/** Demo data: clearly named "Demo" so it is never mistaken for real records. */
export function demoData(now = new Date()): { account: Account; trades: Trade[]; cashflows: Cashflow[] } {
  const iso = (daysAgo: number, h: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, h)).toISOString();
  const ts = nowIso();
  const account: Account = { id: newId('acc'), name: 'Demo account', baseCurrency: 'USD', openingKind: 'balance', openingAmount: '10000', openingDate: iso(30, 0), broker: 'Demo', notes: 'Demo data', archived: false, createdAt: ts, updatedAt: ts };
  const P = (id: string) => ({ ...ILLUSTRATIVE_PROFILES.find((p) => p.id === id)! });
  const mk = (sym: string, dir: Trade['direction'], q: string, e: string, x: string, d: number, stop: string, target: string | null, strategy: string, commission = '0'): Trade =>
    prepareTrade({
      id: newId('t'), accountId: account.id, profile: P(sym), direction: dir,
      fills: [{ id: newId('f'), side: 'entry', quantity: q, price: e, at: iso(d, 13) }, { id: newId('f'), side: 'exit', quantity: q, price: x, at: iso(d, 15) }],
      initialStop: stop, initialTarget: target, initialRisk: null,
      conversion: { from: 'USD', to: 'USD', rate: '1', source: 'identity', asOf: iso(d, 13) },
      costs: { commission, swap: '0', other: '0' }, pnlMode: 'computed', manualNetPnl: null,
      strategy, setup: '', tags: ['demo'], emotions: [], mistakes: [], notes: 'Demo trade', importBatchId: null, fingerprint: '', createdAt: ts, updatedAt: ts,
    });
  const trades = [
    mk('ex-eurusd', 'long', '0.2', '1.1000', '1.1080', 20, '1.0950', '1.1100', 'Breakout', '1.4'),
    mk('ex-xauusd', 'short', '0.1', '2400', '2410', 15, '2410', '2380', 'Reversal', '0.7'),
    mk('ex-nas100', 'long', '1', '20000', '20120', 9, '19940', '20150', 'Trend', '0'),
    mk('ex-eurusd', 'short', '0.3', '1.0950', '1.0930', 4, '1.0980', '1.0890', 'Breakout', '2.1'),
  ];
  const cashflows: Cashflow[] = [{ id: newId('cf'), accountId: account.id, type: 'deposit', amount: '500', at: iso(10, 9), note: 'Demo deposit', importBatchId: null, createdAt: ts, updatedAt: ts }];
  return { account, trades, cashflows };
}
