import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { D, ILLUSTRATIVE_PROFILES, type InstrumentProfile } from '@tc/domain';
import { calculateMargin, calculatePipTick, calculatePnl, calculatePositionSize, calculateRiskReward, roundQuantityDown, summarizePortfolioRisk, targetForRatio } from '../src';

const byId = (id: string) => {
  const p = ILLUSTRATIVE_PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};
const eurusd = byId('ex-eurusd');
const gold = byId('ex-xauusd');
const nas = byId('ex-nas100');

function unwrap<T>(r: { ok: true; value: T } | { ok: false; errors: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
}

describe('golden cases (independent, excluding costs)', () => {
  it('EURUSD $10,000, 1%, 1.1000→1.0950 gives 0.20 lots and $100 risk', () => {
    const r = unwrap(calculatePositionSize({ profile: eurusd, accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '10000', riskMode: 'percent', riskValue: '1', direction: 'long', entry: '1.1000', stop: '1.0950' }));
    expect(r.quantity?.toFixed()).toBe('0.2');
    expect(r.modeledRisk?.toFixed()).toBe('100');
    expect(r.stopPips?.toFixed()).toBe('50');
    expect(r.stopTicks.toFixed()).toBe('500');
    expect(r.conversion.source).toBe('identity');
  });
  it('EURUSD pip value is $10 per 1 lot', () => {
    const r = unwrap(calculatePipTick({ profile: eurusd, quantity: '1', accountCurrency: 'USD' }));
    expect(r.pipValueAccount?.toFixed()).toBe('10');
    expect(r.tickValueAccount.toFixed()).toBe('1');
  });
  it('EURUSD 0.20 lots at 100:1 needs $220 entry-based margin', () => {
    const r = unwrap(calculateMargin({ profile: eurusd, quantity: '0.20', price: '1.1000', accountCurrency: 'USD' }));
    expect(r.status).toBe('estimated');
    if (r.status === 'estimated') expect(r.margin.toFixed()).toBe('220');
  });
  it('Gold 100 oz/lot, $5 stop, $100 risk → 0.20 lots', () => {
    const r = unwrap(calculatePositionSize({ profile: gold, accountCurrency: 'USD', accountBasis: 'equity', accountAmount: '10000', riskMode: 'cash', riskValue: '100', direction: 'short', entry: '2400', stop: '2405' }));
    expect(r.quantity?.toFixed()).toBe('0.2');
  });
  it('Index $1/point/lot, 50 point stop, $100 risk → 2 lots; multiplier changes sizing', () => {
    const r = unwrap(calculatePositionSize({ profile: { ...nas, minQuantity: '0.01', quantityStep: '0.01' }, accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '10000', riskMode: 'cash', riskValue: '100', direction: 'long', entry: '20000', stop: '19950' }));
    expect(r.quantity?.toFixed()).toBe('2');
    const r10 = unwrap(calculatePositionSize({ profile: { ...nas, contractMultiplier: '10', minQuantity: '0.01', quantityStep: '0.01' }, accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '10000', riskMode: 'cash', riskValue: '100', direction: 'long', entry: '20000', stop: '19950' }));
    expect(r10.quantity?.toFixed()).toBe('0.2');
  });
});

describe('conversion', () => {
  it('requires a conversion for EUR account on USDJPY — never defaults to 1', () => {
    const r = calculatePositionSize({ profile: byId('ex-usdjpy'), accountCurrency: 'EUR', accountBasis: 'balance', accountAmount: '10000', riskMode: 'percent', riskValue: '1', direction: 'long', entry: '150', stop: '149' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((x) => x.code)).toContain('error.conversionRequired');
  });
  it('uses manual JPY→EUR rate', () => {
    // 1 JPY = 0.006 EUR; stop 1.00 JPY × 100000 = 100000 JPY/lot = 600 EUR/lot; 100 EUR → 0.16 lots (floored)
    const r = unwrap(calculatePositionSize({ profile: byId('ex-usdjpy'), accountCurrency: 'EUR', accountBasis: 'balance', accountAmount: '10000', riskMode: 'percent', riskValue: '1', direction: 'long', entry: '150', stop: '149', conversionRate: '0.006' }));
    expect(r.quantity?.toFixed()).toBe('0.16');
    expect(r.modeledRisk?.toFixed()).toBe('96');
    expect(r.conversion.source).toBe('manual');
  });
  it('derives quote→base rate from price when account currency is the base (USD account, USDJPY)', () => {
    // stop 1 JPY × 100000 = 100000 JPY/lot ÷ 150 = 666.67 USD/lot → $100 / 666.67 = 0.15 lots
    const r = unwrap(calculatePositionSize({ profile: byId('ex-usdjpy'), accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '10000', riskMode: 'percent', riskValue: '1', direction: 'long', entry: '150', stop: '149' }));
    expect(r.conversion.source).toBe('instrument_price');
    expect(r.quantity?.toFixed()).toBe('0.15');
    expect(r.assumptions).toContain('assume.conversionFromEntry');
  });
  it('pip value for EURUSD in a GBP account with manual USD→GBP rate', () => {
    const r = unwrap(calculatePipTick({ profile: eurusd, quantity: '1', accountCurrency: 'GBP', conversionRate: '0.8' }));
    expect(r.pipValueAccount?.toFixed()).toBe('8');
  });
});

describe('quantity bounds and steps', () => {
  it('below minimum → no valid position (never rounded up)', () => {
    const r = unwrap(calculatePositionSize({ profile: eurusd, accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '100', riskMode: 'percent', riskValue: '1', direction: 'long', entry: '1.1000', stop: '1.0950' }));
    expect(r.status).toBe('below_minimum');
    expect(r.quantity).toBeNull();
    expect(r.modeledRisk).toBeNull();
  });
  it('caps at maximum and reports it', () => {
    const r = roundQuantityDown(D('150.5'), eurusd);
    expect(r.status).toBe('capped_at_maximum');
    expect(r.quantity?.toFixed()).toBe('100');
  });
  it('property: rounded quantity never exceeds budget and is a valid step', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10_000_000 }),
        fc.integer({ min: 1, max: 500 }), // risk in basis points
        fc.integer({ min: 1, max: 5000 }), // stop distance in points
        fc.constantFrom<InstrumentProfile>(eurusd, gold, nas, byId('ex-es'), byId('ex-aapl'), byId('ex-btcusdt')),
        fc.boolean(),
        (balance, riskBp, stopPts, profile, long) => {
          const entry = D('1000');
          const dist = D(stopPts).mul(D(profile.tickSize));
          if (dist.gte(entry)) return;
          const stop = long ? entry.minus(dist) : entry.plus(dist);
          const r = calculatePositionSize({ profile, accountCurrency: profile.settlementCurrency, accountBasis: 'balance', accountAmount: String(balance), riskMode: 'percent', riskValue: D(riskBp).div(100).toFixed(), direction: long ? 'long' : 'short', entry: entry.toFixed(), stop: stop.toFixed(), commissionPerQuantity: '0.5', commissionFixed: '1' });
          if (!r.ok) throw new Error(JSON.stringify(r.errors));
          const v = r.value;
          if (v.quantity) {
            expect(v.modeledRisk!.lte(v.riskBudget)).toBe(true);
            expect(v.quantity.mod(D(profile.quantityStep)).isZero()).toBe(true);
            expect(v.quantity.gte(D(profile.minQuantity))).toBe(true);
            // one more step would exceed the budget (unless capped)
            if (v.status === 'ok') expect(v.quantity.plus(D(profile.quantityStep)).mul(v.lossPerQuantity).plus(1).gt(v.riskBudget)).toBe(true);
          }
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe('validation', () => {
  it('rejects stop on wrong side, equal stop and percent > 100', () => {
    const base = { profile: eurusd, accountCurrency: 'USD', accountBasis: 'balance' as const, accountAmount: '10000', riskMode: 'percent' as const, riskValue: '1', direction: 'long' as const, entry: '1.1', stop: '1.2' };
    const codes = (x: ReturnType<typeof calculatePositionSize>) => (x.ok ? [] : x.errors.map((e) => e.code));
    expect(codes(calculatePositionSize(base))).toContain('error.longStopAboveEntry');
    expect(codes(calculatePositionSize({ ...base, direction: 'short', stop: '1.0' }))).toContain('error.shortStopBelowEntry');
    expect(codes(calculatePositionSize({ ...base, stop: '1.1' }))).toContain('error.stopEqualsEntry');
    expect(codes(calculatePositionSize({ ...base, stop: '1.09', riskValue: '150' }))).toContain('error.percentMax100');
    expect(codes(calculatePositionSize({ ...base, entry: 'abc' }))).toContain('error.notANumber');
  });
  it('accepts Persian and Arabic digits', () => {
    const r = unwrap(calculatePositionSize({ profile: eurusd, accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '۱۰\u066c۰۰۰', riskMode: 'percent', riskValue: '١', direction: 'long', entry: '۱\u066b۱۰۰۰', stop: '١\u066b٠٩٥٠' }));
    expect(r.quantity?.toFixed()).toBe('0.2');
  });
  it('rejects nonlinear contract types', () => {
    const r = calculatePositionSize({ profile: { ...eurusd, contractType: 'inverse' }, accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '10000', riskMode: 'percent', riskValue: '1', direction: 'long', entry: '1.1', stop: '1.09' });
    expect(r.ok).toBe(false);
  });
});

describe('costs', () => {
  it('commission and slippage reduce size consistently', () => {
    // loss/lot = (0.0050+0.0002)×100000 + 7 = 527; (100-0)/527 = 0.1897 → 0.18; risk = 94.86
    const r = unwrap(calculatePositionSize({ profile: eurusd, accountCurrency: 'USD', accountBasis: 'balance', accountAmount: '10000', riskMode: 'percent', riskValue: '1', direction: 'long', entry: '1.1000', stop: '1.0950', commissionPerQuantity: '7', slippage: '0.0002' }));
    expect(r.quantity?.toFixed()).toBe('0.18');
    expect(r.modeledRisk?.toFixed()).toBe('94.86');
  });
});

describe('margin models', () => {
  it('percent of notional (index CFD 5%)', () => {
    const r = unwrap(calculateMargin({ profile: nas, quantity: '2', price: '20000', accountCurrency: 'USD', freeMargin: '1000' }));
    if (r.status !== 'estimated') throw new Error();
    expect(r.margin.toFixed()).toBe('2000');
    expect(r.sufficient).toBe(false);
    expect(r.freeMarginAfter?.toFixed()).toBe('-1000');
  });
  it('fixed per contract', () => {
    const es = { ...byId('ex-es'), margin: { kind: 'fixed_per_quantity' as const, amount: '15000', currency: 'USD' } };
    const r = unwrap(calculateMargin({ profile: es, quantity: '2', price: '5000', accountCurrency: 'USD' }));
    if (r.status !== 'estimated') throw new Error();
    expect(r.margin.toFixed()).toBe('30000');
  });
  it('unsupported model yields no estimate', () => {
    const r = unwrap(calculateMargin({ profile: byId('ex-es'), quantity: '1', price: '5000', accountCurrency: 'USD' }));
    expect(r.status).toBe('unsupported');
  });
  it('full notional (cash shares)', () => {
    const r = unwrap(calculateMargin({ profile: byId('ex-aapl'), quantity: '10', price: '200', accountCurrency: 'USD' }));
    if (r.status !== 'estimated') throw new Error();
    expect(r.margin.toFixed()).toBe('2000');
  });
  it('leverage override', () => {
    const r = unwrap(calculateMargin({ profile: eurusd, quantity: '1', price: '1.1', accountCurrency: 'USD', leverageOverride: '30' }));
    if (r.status !== 'estimated') throw new Error();
    expect(r.margin.toDecimalPlaces(2).toFixed()).toBe('3666.67');
  });
});

describe('P&L and risk/reward', () => {
  it('short gold P&L with fees and swap', () => {
    const r = unwrap(calculatePnl({ profile: gold, accountCurrency: 'USD', direction: 'short', quantity: '0.5', entry: '2400', exit: '2390', commissionPerQuantity: '10', swap: '3' }));
    expect(r.grossAccount.toFixed()).toBe('500');
    expect(r.costs.toFixed()).toBe('8');
    expect(r.net.toFixed()).toBe('492');
  });
  it('risk/reward with costs and target from ratio', () => {
    const r = unwrap(calculateRiskReward({ direction: 'long', entry: '1.1000', stop: '1.0950', target: '1.1100', profile: eurusd, quantity: '0.2', accountCurrency: 'USD', costs: '4' }));
    expect(r.ratio.toFixed()).toBe('2');
    expect(r.cash?.risk.toFixed()).toBe('100');
    expect(r.cash?.reward.toFixed()).toBe('200');
    expect(r.cash?.ratioAfterCosts?.toDecimalPlaces(4).toFixed()).toBe('1.8846');
    expect(unwrap(targetForRatio('short', '2400', '2410', '3')).toFixed()).toBe('2370');
  });
  it('portfolio risk is a nominal sum', () => {
    const r = unwrap(summarizePortfolioRisk([{ label: 'A', risk: '100' }, { label: 'B', risk: '50.5' }], '10000'));
    expect(r.nominalTotal.toFixed()).toBe('150.5');
    expect(r.percentOfAccount?.toFixed()).toBe('1.505');
  });
});
