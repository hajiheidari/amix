import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ar, en, fa, formatDecimalString, localeTag, placeholders, translate } from '../src';

const keys = Object.keys(en).sort();

describe('translation parity', () => {
  it('fa and ar have exactly the English keys', () => {
    expect(Object.keys(fa).sort()).toEqual(keys);
    expect(Object.keys(ar).sort()).toEqual(keys);
  });
  it('placeholders match in every language', () => {
    for (const k of keys) {
      const p = placeholders((en as Record<string, string>)[k]!);
      expect([k, placeholders((fa as Record<string, string>)[k]!)]).toEqual([k, p]);
      expect([k, placeholders((ar as Record<string, string>)[k]!)]).toEqual([k, p]);
    }
  });
  it('no empty translations; fa/ar are not English copies (except brand/format strings)', () => {
    const allowSame = /^(app\.name|common\.infinity|imp\.df\.|sess\.always)/;
    for (const k of keys) {
      for (const d of [fa, ar] as Record<string, string>[]) {
        expect(d[k]!.trim().length, k).toBeGreaterThan(0);
        if (!allowSame.test(k)) expect(d[k], k).not.toBe((en as Record<string, string>)[k]);
      }
    }
  });
  it('every key referenced in source code exists', () => {
    const roots = ['../../apps/client/src', '../../packages/calculators/src', '../../packages/journal/src', '../../packages/storage/src', '../../packages/domain/src', '../../packages/ui/src', '../../packages/data-contracts/src'].map((p) => join(__dirname, p));
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) files.push(p);
      }
    };
    roots.forEach((r) => {
      try {
        walk(r);
      } catch {
        /* optional dir */
      }
    });
    const missing = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!(m[1]! in en)) missing.add(`${m[1]} (${f.split('/').slice(-2).join('/')})`);
      for (const m of src.matchAll(/'((?:error|import|backup|assume)\.[a-zA-Z0-9_.]+)'/g)) if (!(m[1]! in en) && !m[1]!.endsWith('.')) missing.add(`${m[1]} (${f.split('/').slice(-2).join('/')})`);
    }
    expect([...missing]).toEqual([]);
  });
});

describe('formatting', () => {
  it('interpolates and falls back to English', () => {
    expect(translate('fa', 'error.conversionRequired', { from: 'JPY', to: 'EUR' })).toContain('JPY→EUR');
    expect(translate('ar', 'no.such.key')).toBe('no.such.key');
  });
  it('formats decimals in each numeral system without float rounding', () => {
    expect(formatDecimalString('1234567.891', 'latn')).toBe('1,234,567.891');
    expect(formatDecimalString('-0.20', 'arabext', { minDp: 2 })).toBe('−۰٫۲۰');
    expect(formatDecimalString('1000', 'arab')).toBe('١٬٠٠٠');
    expect(formatDecimalString('0.000', 'latn', { sign: true })).toBe('0');
    expect(formatDecimalString('12.5', 'latn', { sign: true })).toBe('+12.5');
  });
  it('forces the Gregorian calendar for fa/ar', () => {
    const d = new Date('2026-03-18T12:00:00Z');
    const fmt = new Intl.DateTimeFormat(localeTag('fa', 'latn'), { year: 'numeric', timeZone: 'UTC' }).format(d);
    expect(fmt).toContain('2026');
    const fmtAr = new Intl.DateTimeFormat(localeTag('ar', 'latn'), { year: 'numeric', timeZone: 'UTC' }).format(d);
    expect(fmtAr).toContain('2026');
  });
});
