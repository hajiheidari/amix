import { describe, expect, it } from 'vitest';
import { fetchCatalogFile, fetchCatalogIndex, isStale, needsCheck, parseCatalogIndex, updateAvailable } from '../src';

const index = {
  format: 'amix-broker-catalog', version: 1, updatedAt: '2026-10-19T03:20:00Z',
  entries: [
    { id: 'exness-standard', broker: 'Exness', accountType: 'Standard', server: 'Exness-MT5Trial', platform: 'MT5', file: 'exness-standard.json', exportedAt: '2026-10-19T03:20:00Z', symbolCount: 250, accountCurrency: 'USD', leverage: 2000 },
    { id: 'evil', broker: 'X', file: '../../secrets.json' },
  ],
};

describe('broker catalog', () => {
  it('parses entries and rejects unsafe file names', () => {
    const r = parseCatalogIndex(JSON.stringify(index));
    if (!r.ok) throw new Error(r.code);
    expect(r.value.entries.map((e) => e.id)).toEqual(['exness-standard']);
    expect(parseCatalogIndex('nope').ok).toBe(false);
  });
  it('checks weekly and detects newer exports', () => {
    const now = Date.parse('2026-10-20T00:00:00Z');
    expect(needsCheck({ entryId: null, exportedAt: null, lastCheckedAt: null }, now)).toBe(false);
    expect(needsCheck({ entryId: 'exness-standard', exportedAt: null, lastCheckedAt: '2026-10-18T00:00:00Z' }, now)).toBe(false);
    expect(needsCheck({ entryId: 'exness-standard', exportedAt: null, lastCheckedAt: '2026-10-10T00:00:00Z' }, now)).toBe(true);
    const r = parseCatalogIndex(JSON.stringify(index));
    if (!r.ok) throw new Error();
    expect(updateAvailable({ entryId: 'exness-standard', exportedAt: '2026-10-12T03:20:00Z', lastCheckedAt: null }, r.value)?.id).toBe('exness-standard');
    expect(updateAvailable({ entryId: 'exness-standard', exportedAt: '2026-10-19T03:20:00Z', lastCheckedAt: null }, r.value)).toBeNull();
    expect(isStale('2026-10-01T00:00:00Z', now)).toBe(true);
  });
  it('reports network failures as offline instead of throwing', async () => {
    expect(await fetchCatalogIndex(async () => { throw new Error('net'); })).toEqual({ ok: false, code: 'cat.offline' });
    expect(await fetchCatalogIndex(async () => ({ ok: false, text: async () => '' }))).toEqual({ ok: false, code: 'cat.offline' });
    const r = parseCatalogIndex(JSON.stringify(index));
    if (!r.ok) throw new Error();
    expect(await fetchCatalogFile(async (u) => ({ ok: true, text: async () => u }), r.value.entries[0]!)).toContain('exness-standard.json');
  });
});
