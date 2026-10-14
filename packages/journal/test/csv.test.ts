import { describe, expect, it } from 'vitest';
import { ILLUSTRATIVE_PROFILES } from '@tc/domain';
import { exportTradesCsv, guessMapping, neutralizeCell, parseCsv, parseTimestamp, previewImport, summarizeTrade, type ImportOptions } from '../src';
import { accountEUR, accountUSD, trades } from '../../../tests/fixtures/reference-ledger';

const opts = (over: Partial<ImportOptions> = {}): Omit<ImportOptions, 'mapping'> & { mapping?: ImportOptions['mapping'] } => ({
  shape: 'fills', account: accountUSD, profiles: ILLUSTRATIVE_PROFILES, existingTrades: [], zone: 'UTC', dateFormat: 'iso', importBatchId: 'b1', ...over,
});

function preview(csv: string, over: Partial<ImportOptions> = {}) {
  const p = parseCsv(csv);
  if (!p.ok) throw new Error(p.code);
  const o = opts(over);
  return previewImport(p.value, { ...o, mapping: o.mapping ?? guessMapping(p.value.headers, o.shape) } as ImportOptions);
}

describe('formula injection', () => {
  it('neutralizes text but keeps negative numbers', () => {
    expect(neutralizeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(neutralizeCell('+1+1')).toBe(`'+1+1`);
    expect(neutralizeCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(neutralizeCell('-12.5')).toBe('-12.5');
    expect(neutralizeCell('-cmd')).toBe(`'-cmd`);
    expect(neutralizeCell('normal')).toBe('normal');
  });
});

describe('canonical export → import round trip', () => {
  const usdTrades = trades.filter((t) => t.accountId === 'acc-usd').map((t) => ({ ...t, notes: t.id === 'T1' ? 'line one,\n"quoted" — یادداشت فارسی / ملاحظة' : t.notes, tags: t.id === 'T1' ? ['=evil', 'news'] : t.tags }));
  const csv = exportTradesCsv(usdTrades, [accountUSD, accountEUR]);

  it('writes BOM, CRLF and neutralized text cells', () => {
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain(`'=evil;news`);
    expect(csv).toContain('-20'); // manual negative P&L untouched
  });

  it('re-imports with identical P&L, partials, multiline notes and RTL text', () => {
    const r = preview(csv);
    expect(r.invalid).toEqual([]);
    expect(r.valid.length).toBe(usdTrades.length);
    const t1 = r.valid.find((t) => t.profile.symbol === 'EURUSD' && t.notes.includes('یادداشت'))!;
    expect(t1.notes).toBe('line one,\n"quoted" — یادداشت فارسی / ملاحظة');
    expect(t1.tags).toEqual(['=evil', 'news']);
    const nets = r.valid.map((t) => summarizeTrade(t, 'USD').net?.toFixed() ?? null).sort();
    const orig = usdTrades.map((t) => summarizeTrade(t, 'USD').net?.toFixed() ?? null).sort();
    expect(nets).toEqual(orig);
    expect(r.valid.some((t) => t.fills.filter((f) => f.side === 'exit').length === 2)).toBe(true);
  });

  it('detects duplicates against existing trades and within the file', () => {
    const first = preview(csv);
    const again = preview(csv, { existingTrades: first.valid });
    expect(again.valid.length).toBe(0);
    expect(again.duplicates.length).toBe(first.valid.length);
    const doubled = csv + csv.split('\r\n').slice(1).join('\r\n');
    const d = preview(doubled);
    expect(d.duplicates.length).toBe(0); // same trade_ref groups the rows into one trade...
    expect(d.invalid[0]!.errors.map((e) => e.code)).toContain('import.duplicateRow'); // ...and identical fill rows are rejected
  });
});

describe('round-trip shape, mapping and validation', () => {
  const header = 'Ticket,Open Time,Type,Volume,Symbol,Open Price,S/L,T/P,Close Time,Close Price,Commission,Swap,Comment';
  it('maps a generic broker-style export with explicit zone and date format', () => {
    const csv = [header, '1001,2026.03.18 10:00:00,buy,0.20,EURUSD,1.1000,1.0950,1.1100,2026.03.18 12:30:00,1.1040,1.4,0,"note, with comma"'].join('\n');
    const r = preview(csv, { shape: 'round_trip', dateFormat: 'ymd_dots', zone: 'Europe/Athens' });
    expect(r.invalid).toEqual([]);
    const t = r.valid[0]!;
    expect(t.fills[0]!.at).toBe('2026-03-18T08:00:00.000Z'); // Athens is UTC+2 in March before DST
    expect(summarizeTrade(t, 'USD').net?.toFixed()).toBe('78.6');
    expect(t.initialRisk).toBe('100');
  });
  it('reports row-specific errors', () => {
    const csv = [header,
      '1,2026.03.18 10:00,buy,0.2,EURUSD,1.1,,,2026.03.18 11:00,1.2,,,',
      '2,not a date,buy,0.2,EURUSD,1.1,,,,,,,',
      '3,2026.03.18 10:00,hold,0.2,EURUSD,1.1,,,,,,,',
      '4,2026.03.18 10:00,sell,0.2,UNKNOWN,1.1,,,,,,,',
      '5,2026.03.18 10:00,sell,abc,EURUSD,1.1,,,,,,,',
      '6,2026.03.18 10:00,buy,0.2,EURUSD,1.1,1.2,,,,,,',
    ].join('\n');
    const r = preview(csv, { shape: 'round_trip', dateFormat: 'ymd_dots' });
    expect(r.valid.length).toBe(1);
    const byRow = Object.fromEntries(r.invalid.map((i) => [i.row, i.errors.map((e) => e.code)]));
    expect(byRow[2]).toContain('error.invalidDate');
    expect(byRow[3]).toContain('import.badDirection');
    expect(byRow[4]).toContain('import.unknownSymbol');
    expect(byRow[5]).toContain('error.notANumber');
    expect(byRow[6]).toContain('error.longStopAboveEntry');
  });
  it('requires a conversion or net P&L for cross-currency trades', () => {
    const csv = [header, '1,2026.03.18 10:00,buy,0.2,EURUSD,1.1,,,2026.03.18 11:00,1.2,,,'].join('\n');
    const r = preview(csv, { shape: 'round_trip', dateFormat: 'ymd_dots', account: accountEUR });
    expect(r.invalid[0]!.errors[0]!.code).toBe('error.conversionRequired');
  });
  it('flags unmapped required fields', () => {
    const r = preview('a,b\n1,2', { shape: 'round_trip' });
    expect(r.invalid[0]!.row).toBe(0);
    expect(r.invalid[0]!.errors.some((e) => e.code === 'import.unmappedRequired')).toBe(true);
  });
  it('rejects malformed quoting, empty files and oversize input', () => {
    expect(parseCsv('a,b\n"unterminated,1')).toMatchObject({ ok: false, code: 'import.malformedCsv' });
    expect(parseCsv('a,b')).toMatchObject({ ok: false, code: 'import.empty' });
    expect(parseCsv('a\n1', 6 * 1024 * 1024)).toMatchObject({ ok: false, code: 'import.fileTooLarge' });
  });
  it('accepts Persian digits in timestamps and numbers', () => {
    expect(parseTimestamp('۲۰۲۶-۰۳-۱۸ ۱۰:۰۰', 'iso', 'UTC')).toBe('2026-03-18T10:00:00.000Z');
    const csv = [header, '1,۲۰۲۶.۰۳.۱۸ ۱۰:۰۰,خرید,۰\u066b۲,EURUSD,۱\u066b۱,,,۲۰۲۶.۰۳.۱۸ ۱۱:۰۰,۱\u066b۱۰۱,,,'].join('\n');
    const r = preview(csv, { shape: 'round_trip', dateFormat: 'ymd_dots' });
    expect(r.invalid).toEqual([]);
    expect(summarizeTrade(r.valid[0]!, 'USD').net?.toFixed()).toBe('20');
  });
});
