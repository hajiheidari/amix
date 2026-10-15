import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateMargin, calculatePipTick, calculatePositionSize } from '@tc/calculators';
import { mapExport, mtDec, parseMtExport, type MtExport } from '../src';

const text = readFileSync(join(__dirname, '../../../tests/fixtures/mt5-export.sample.json'), 'utf8');
const parsed = parseMtExport(text);
if (!parsed.ok) throw new Error(parsed.code);
const exp: MtExport = parsed.value;
const mapped = mapExport(exp, []);
const get = (name: string) => mapped.find((m) => m.symbol === name)!;
const ok = <T>(r: { ok: true; value: T } | { ok: false; errors: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe('MetaTrader export parsing', () => {
  it('rejects wrong files', () => {
    expect(parseMtExport('x')).toMatchObject({ ok: false, code: 'mt.err.notJson' });
    expect(parseMtExport('{"format":"other"}')).toMatchObject({ ok: false, code: 'mt.err.wrongFormat' });
    expect(parseMtExport(JSON.stringify({ format: 'amix-mt-symbols', version: 99, symbols: [] }))).toMatchObject({ ok: false, code: 'mt.err.newerVersion' });
    expect(parseMtExport(JSON.stringify({ format: 'amix-mt-symbols', version: 1, symbols: [] }))).toMatchObject({ ok: false, code: 'mt.err.empty' });
  });
  it('cleans binary noise from doubles', () => {
    expect(mtDec(0.1 + 0.2)).toBe('0.3');
    expect(mtDec(1e-5)).toBe('0.00001');
  });
});

describe('mapping to broker-verified profiles', () => {
  it('maps FX with broker suffix, pip from 5 digits and leverage margin', () => {
    const p = get('EURUSD.m').profile!;
    expect(p.assetClass).toBe('fx');
    expect(p.contractMultiplier).toBe('100000');
    expect(p.pipSize).toBe('0.0001');
    expect(p.tickSize).toBe('0.00001');
    expect(p.margin).toEqual({ kind: 'leverage', leverage: '100' });
    expect(p.verification).toBe('broker_verified');
    expect(p.broker).toBe('Sample Broker Ltd · Sample-Demo');
    expect(p.verifiedAt).toBe('2026-10-15');
  });
  it('reproduces the golden cases with imported profiles', () => {
    const eur = get('EURUSD.m').profile!;
    expect(ok(calculatePositionSize({ profile: eur, accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '10000', riskMode: 'percent', riskValue: '1', direction: 'long', entry: '1.1000', stop: '1.0950' })).quantity?.toFixed()).toBe('0.2');
    expect(ok(calculatePipTick({ profile: eur, quantity: '1', accountCurrency: 'USD' })).pipValueAccount?.toFixed()).toBe('10');
    const m = ok(calculateMargin({ profile: eur, quantity: '0.2', price: '1.1', accountCurrency: 'USD' }));
    expect(m.status === 'estimated' && m.margin.toFixed()).toBe('220');
    const gold = get('XAUUSD.m').profile!;
    expect(gold.assetClass).toBe('metal_cfd');
    expect(ok(calculatePositionSize({ profile: gold, accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '10000', riskMode: 'cash', riskValue: '100', direction: 'long', entry: '2400', stop: '2395' })).quantity?.toFixed()).toBe('0.2');
    const nas = get('NAS100').profile!;
    expect(nas.assetClass).toBe('index_cfd');
    expect(nas.margin).toEqual({ kind: 'percent_notional', percent: '5' });
    expect(ok(calculatePositionSize({ profile: nas, accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '10000', riskMode: 'cash', riskValue: '100', direction: 'long', entry: '20000', stop: '19950' })).quantity?.toFixed()).toBe('2');
  });
  it('uses tick value for futures/CFD-index modes and flags deposit-currency tick values', () => {
    const es = get('ESZ6').profile!;
    expect(es.assetClass).toBe('future');
    expect(es.contractMultiplier).toBe('50');
    expect(es.quantityUnit).toBe('contract');
    expect(es.margin).toEqual({ kind: 'fixed_per_quantity', amount: '15000', currency: 'USD' });
    const dax = get('DAX40');
    expect(dax.profile!.settlementCurrency).toBe('USD');
    expect(dax.warnings).toContain('mt.warn.tickValueDeposit');
    expect(dax.warnings).toContain('mt.warn.marginUnsupported');
  });
  it('requires conversion for cross-currency FX instead of assuming 1', () => {
    const jpy = get('USDJPY.m').profile!;
    expect(jpy.settlementCurrency).toBe('JPY');
    const r = calculatePositionSize({ profile: jpy, accountCurrency: 'EUR', accountBasis: 'balance', accountAmount: '10000', riskMode: 'percent', riskValue: '1', direction: 'long', entry: '150', stop: '149' });
    expect(r.ok).toBe(false);
  });
  it('flags disabled symbols and rejects unsupported calculation modes', () => {
    expect(get('AAPL').warnings).toContain('mt.warn.tradeDisabled');
    expect(get('AAPL').profile!.quantityUnit).toBe('share');
    expect(get('BOND1').profile).toBeNull();
    expect(get('BOND1').error).toBe('mt.err.unsupportedMode');
  });
  it('re-import updates the same profile id instead of duplicating', () => {
    const first = get('EURUSD.m').profile!;
    const again = mapExport(exp, [{ ...first, version: 3 }]).find((m) => m.symbol === 'EURUSD.m')!.profile!;
    expect(again.id).toBe(first.id);
    expect(again.version).toBe(3);
  });
});

describe('margin rate not reported', () => {
  it('is unsupported instead of assuming a rate', () => {
    const s = { ...exp.symbols.find((x) => x.name === 'NAS100')!, marginRate: 0 };
    const m = mapExport({ ...exp, symbols: [s] }, [])[0]!;
    expect(m.profile!.margin.kind).toBe('unsupported');
    expect(m.warnings).toContain('mt.warn.marginRateUnknown');
  });
});
