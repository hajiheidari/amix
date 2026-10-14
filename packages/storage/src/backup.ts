import { isCurrencyCode, mergeSettings, parseDecimal, type Settings } from '@tc/domain';
import type { DataSnapshot } from './repository';

export const BACKUP_FORMAT = 'trading-companion-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  appVersion: string;
  counts: Record<string, number>;
  data: DataSnapshot;
}

export function createBackup(s: DataSnapshot, appVersion: string, now = new Date()): string {
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    appVersion,
    counts: { accounts: s.accounts.length, cashflows: s.cashflows.length, trades: s.trades.length, profiles: s.profiles.length, userEvents: s.userEvents.length },
    data: s,
  };
  return JSON.stringify(file, null, 1);
}

export type BackupParse = { ok: true; value: { snapshot: DataSnapshot; exportedAt: string; version: number; counts: Record<string, number> } } | { ok: false; code: string; detail?: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/**
 * Backup migrations: `MIGRATIONS[n]` upgrades a version-n payload to n+1.
 * Version 1 is the first released format, so the table is empty today; the
 * loop below is exercised as soon as version 2 exists.
 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

export function parseBackup(text: string, byteLength = text.length): BackupParse {
  if (byteLength > BACKUP_MAX_BYTES) return { ok: false, code: 'backup.tooLarge' };
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\ufeff/, ''));
  } catch {
    return { ok: false, code: 'backup.notJson' };
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, code: 'backup.wrongFormat' };
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, code: 'backup.wrongFormat' };
  if (version > BACKUP_VERSION) return { ok: false, code: 'backup.newerVersion' };
  let data = raw.data;
  if (!isObj(data)) return { ok: false, code: 'backup.wrongFormat' };
  for (let v = version; v < BACKUP_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) return { ok: false, code: 'backup.noMigration' };
    data = m(data as Record<string, unknown>);
  }
  const d = data as Record<string, unknown>;
  const arr = (k: string): unknown[] | null => (d[k] === undefined ? [] : Array.isArray(d[k]) ? (d[k] as unknown[]) : null);
  const keys = ['accounts', 'cashflows', 'trades', 'profiles', 'importBatches', 'userEvents'] as const;
  const out: Record<string, unknown[]> = {};
  for (const k of keys) {
    const a = arr(k);
    if (!a) return { ok: false, code: 'backup.invalidRecord', detail: k };
    for (const [i, r] of a.entries()) if (!isObj(r) || !isStr(r.id)) return { ok: false, code: 'backup.invalidRecord', detail: `${k}[${i}]` };
    const ids = new Set(a.map((r) => (r as { id: string }).id));
    if (ids.size !== a.length) return { ok: false, code: 'backup.duplicateId', detail: k };
    out[k] = a;
  }
  const accIds = new Set((out.accounts as { id: string }[]).map((a) => a.id));
  for (const [i, a] of (out.accounts as Record<string, unknown>[]).entries()) {
    if (!isStr(a.baseCurrency) || !isCurrencyCode(a.baseCurrency) || !isStr(a.openingAmount) || parseDecimal(a.openingAmount) === null) return { ok: false, code: 'backup.invalidRecord', detail: `accounts[${i}]` };
  }
  for (const [i, t] of (out.trades as Record<string, unknown>[]).entries()) {
    if (!isStr(t.accountId) || !accIds.has(t.accountId) || !Array.isArray(t.fills) || !isObj(t.profile)) return { ok: false, code: 'backup.invalidRecord', detail: `trades[${i}]` };
    for (const f of t.fills as unknown[]) {
      if (!isObj(f) || parseDecimal(f.quantity as string) === null || parseDecimal(f.price as string) === null || !isStr(f.at) || Number.isNaN(Date.parse(f.at))) return { ok: false, code: 'backup.invalidRecord', detail: `trades[${i}].fills` };
    }
  }
  for (const [i, c] of (out.cashflows as Record<string, unknown>[]).entries()) {
    if (!isStr(c.accountId) || !accIds.has(c.accountId) || (c.type !== 'deposit' && c.type !== 'withdrawal') || parseDecimal(c.amount as string) === null) return { ok: false, code: 'backup.invalidRecord', detail: `cashflows[${i}]` };
  }
  const settings = isObj(d.settings) ? mergeSettings(d.settings as Partial<Settings>) : null;
  const snapshot = { ...(out as unknown as Omit<DataSnapshot, 'settings'>), settings } as DataSnapshot;
  return { ok: true, value: { snapshot, exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '', version, counts: Object.fromEntries(keys.map((k) => [k, out[k]!.length])) } };
}
