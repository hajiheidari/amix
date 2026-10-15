/**
 * Broker catalog published weekly by the `Broker catalog` GitHub workflow to the
 * `catalog-data` branch. Each entry is an `amix-mt-symbols` export from a broker's
 * MetaTrader 5 demo server.
 */
export const CATALOG_BASE_URL = 'https://raw.githubusercontent.com/hajiheidari/amix/catalog-data/catalog/';
export const CATALOG_CHECK_INTERVAL_MS = 7 * 86_400_000;
export const CATALOG_STALE_MS = 14 * 86_400_000;

export interface CatalogEntry {
  id: string;
  broker: string;
  accountType: string;
  server: string;
  platform: string;
  file: string;
  exportedAt: string;
  symbolCount: number;
  accountCurrency: string;
  leverage: number;
}

export interface CatalogIndex {
  updatedAt: string;
  entries: CatalogEntry[];
}

export interface CatalogSubscription {
  entryId: string | null;
  exportedAt: string | null;
  lastCheckedAt: string | null;
}

export type CatalogParse = { ok: true; value: CatalogIndex } | { ok: false; code: string };

const SAFE_FILE = /^[a-z0-9][a-z0-9._-]*\.json$/i;

export function parseCatalogIndex(text: string): CatalogParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: 'cat.offline' };
  }
  const r = raw as Record<string, unknown>;
  if (!r || r.format !== 'amix-broker-catalog' || !Array.isArray(r.entries)) return { ok: false, code: 'cat.offline' };
  const entries: CatalogEntry[] = [];
  for (const e0 of r.entries) {
    const e = e0 as Record<string, unknown>;
    if (typeof e?.id !== 'string' || typeof e.file !== 'string' || !SAFE_FILE.test(e.file) || typeof e.broker !== 'string') continue;
    entries.push({
      id: e.id,
      broker: e.broker,
      accountType: typeof e.accountType === 'string' ? e.accountType : '',
      server: typeof e.server === 'string' ? e.server : '',
      platform: typeof e.platform === 'string' ? e.platform : 'MT5',
      file: e.file,
      exportedAt: typeof e.exportedAt === 'string' ? e.exportedAt : '',
      symbolCount: typeof e.symbolCount === 'number' ? e.symbolCount : 0,
      accountCurrency: typeof e.accountCurrency === 'string' ? e.accountCurrency : '',
      leverage: typeof e.leverage === 'number' ? e.leverage : 0,
    });
  }
  return { ok: true, value: { updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '', entries } };
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;

export async function fetchCatalogIndex(fetcher: Fetcher, base = CATALOG_BASE_URL): Promise<CatalogParse> {
  try {
    const res = await fetcher(`${base}index.json?t=${Math.floor(Date.now() / 3_600_000)}`);
    if (!res.ok) return { ok: false, code: 'cat.offline' };
    return parseCatalogIndex(await res.text());
  } catch {
    return { ok: false, code: 'cat.offline' };
  }
}

export async function fetchCatalogFile(fetcher: Fetcher, entry: CatalogEntry, base = CATALOG_BASE_URL): Promise<string | null> {
  if (!SAFE_FILE.test(entry.file)) return null;
  try {
    const res = await fetcher(`${base}${entry.file}?v=${encodeURIComponent(entry.exportedAt)}`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export function needsCheck(sub: CatalogSubscription, now = Date.now()): boolean {
  if (!sub.entryId) return false;
  return !sub.lastCheckedAt || now - Date.parse(sub.lastCheckedAt) >= CATALOG_CHECK_INTERVAL_MS;
}

export function updateAvailable(sub: CatalogSubscription, index: CatalogIndex): CatalogEntry | null {
  const e = index.entries.find((x) => x.id === sub.entryId);
  if (!e || !e.exportedAt) return null;
  return !sub.exportedAt || Date.parse(e.exportedAt) > Date.parse(sub.exportedAt) ? e : null;
}

export function isStale(exportedAt: string, now = Date.now()): boolean {
  return !exportedAt || now - Date.parse(exportedAt) > CATALOG_STALE_MS;
}
