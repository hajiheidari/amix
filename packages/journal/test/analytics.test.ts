import { describe, expect, it } from 'vitest';
import { accountBalance, computeAnalytics, summarizeTrade } from '../src';
import { accountEUR, accountUSD, cashflows, trades } from '../../../tests/fixtures/reference-ledger';

const fx = (d: { toFixed(): string } | null | undefined) => (d ? d.toFixed() : null);

describe('reference ledger', () => {
  const [eur, usd] = computeAnalytics(trades, [accountUSD, accountEUR], cashflows, { zone: 'UTC' });

  it('keeps currencies separate', () => {
    expect(usd!.currency).toBe('USD');
    expect(eur!.currency).toBe('EUR');
    expect(fx(eur!.netPnl)).toBe('90');
    expect(eur!.profitFactor.kind).toBe('infinite');
  });

  it('matches hand-calculated USD statistics', () => {
    const a = usd!;
    expect(a.closedCount).toBe(5);
    expect([a.wins, a.losses, a.breakevens]).toEqual([2, 2, 1]);
    expect(fx(a.winRate)).toBe('40');
    expect(fx(a.netPnl)).toBe('-420.5');
    expect(fx(a.grossProfit)).toBe('107');
    expect(fx(a.grossLoss)).toBe('-527.5');
    expect(a.profitFactor.kind === 'value' && a.profitFactor.value.toDecimalPlaces(6).toFixed()).toBe('0.202844');
    expect(fx(a.expectancy)).toBe('-84.1');
    expect(fx(a.avgWin)).toBe('53.5');
    expect(fx(a.avgLoss)).toBe('-263.75');
    expect(fx(a.avgPlannedR)).toBe('2');
    expect(a.plannedRCount).toBe(2);
    expect(fx(a.avgRealizedR)).toBe('0.25375');
    expect(a.realizedRCount).toBe(4);
    expect(a.curve.map((p) => p.cumulative.toFixed())).toEqual(['49', '-458.5', '-400.5', '-400.5', '-420.5']);
    expect(fx(a.maxDrawdown)).toBe('507.5');
    expect(a.maxDrawdownPercent!.toDecimalPlaces(4).toFixed()).toBe('5.0503') // 507.5 / 10049 = 5.050254 %;
    expect(a.openTrades).toBe(1);
    expect(fx(a.deposits)).toBe('1000');
    expect(fx(a.withdrawals)).toBe('500');
  });

  it('breaks down by instrument, session and weekday', () => {
    const a = usd!;
    expect(a.byInstrument.map((b) => [b.key, b.count, b.net.toFixed()])).toEqual([['EURUSD', 3, '87'], ['NAS100', 1, '0'], ['XAUUSD', 1, '-507.5']]);
    expect(Object.fromEntries(a.bySession.map((b) => [b.key, b.count]))).toEqual({ 'fx-london+fx-newyork': 3, 'fx-london': 1, 'fx-sydney+fx-tokyo': 1 });
    expect(a.byWeekday.map((b) => [b.key, b.count, b.net.toFixed()])).toEqual([['1', 2, '29'], ['2', 1, '-507.5'], ['3', 1, '58'], ['5', 1, '0']]);
    expect(Object.fromEntries(a.byStrategy.map((b) => [b.key, b.net.toFixed()]))).toEqual({ Breakout: '107', Reversal: '-507.5', '—': '-20' });
  });

  it('cashflows change balance but never P&L', () => {
    const b = accountBalance(accountUSD, trades, cashflows);
    expect(fx(b.realized)).toBe('-420.5');
    expect(fx(b.balance)).toBe('10079.5');
  });

  it('filters by date range (close time) and disables % drawdown', () => {
    const [u] = computeAnalytics(trades, [accountUSD], cashflows, { zone: 'UTC', from: '2026-01-07T00:00:00Z', to: '2026-01-10T00:00:00Z' });
    expect(u!.closedCount).toBe(2);
    expect(u!.maxDrawdownPercent).toBeNull();
    expect(fx(u!.deposits)).toBe('0');
  });
});

describe('edge cases', () => {
  it('zero data', () => {
    const [a] = computeAnalytics([], [accountUSD], [], { zone: 'UTC' });
    expect(a!.closedCount).toBe(0);
    expect(a!.winRate).toBeNull();
    expect(a!.expectancy).toBeNull();
    expect(a!.profitFactor.kind).toBe('na');
    expect(fx(a!.maxDrawdown)).toBe('0');
  });
  it('zero losses with zero profit is N/A, with profit is infinite', () => {
    const be = trades.filter((t) => t.id === 'T4');
    expect(computeAnalytics(be, [accountUSD], [], { zone: 'UTC' })[0]!.profitFactor.kind).toBe('na');
    const win = trades.filter((t) => t.id === 'T1');
    expect(computeAnalytics(win, [accountUSD], [], { zone: 'UTC' })[0]!.profitFactor.kind).toBe('infinite');
  });
  it('missing conversion makes computed P&L unavailable instead of assuming 1', () => {
    const t = { ...trades.find((x) => x.id === 'T7')!, conversion: null };
    const s = summarizeTrade(t, 'EUR');
    expect(s.net).toBeNull();
    expect(s.pnlSource).toBe('unavailable');
  });
  it('partial close status and short P&L', () => {
    const t = { ...trades.find((x) => x.id === 'T3')!, fills: trades.find((x) => x.id === 'T3')!.fills.slice(0, 2) };
    const s = summarizeTrade(t, 'USD');
    expect(s.status).toBe('partial');
    expect(fx(s.openQty)).toBe('0.1');
    expect(s.realizedR).toBeNull();
    expect(fx(s.net)).toBe('18'); // 0.0020 × 0.1 × 100000 − 2
  });
});

import { computeInitialRisk, tradeFingerprint, validateTrade } from '../src';
describe('incomplete input never throws', () => {
  it('handles empty fill values', () => {
    const t = { ...trades[0]!, fills: [...trades[0]!.fills, { id: 'x', side: 'exit' as const, quantity: '', price: '', at: '' }] };
    expect(() => tradeFingerprint(t)).not.toThrow();
    expect(computeInitialRisk({ ...t, fills: [{ id: 'y', side: 'entry', quantity: '', price: '1', at: '' }] })).toBeNull();
    const v = validateTrade(t, accountUSD);
    expect(v.ok).toBe(false);
  });
});
