import { D, Dec, err, fail, ok, type FieldError, type InstrumentProfile, type Result } from '@tc/domain';
import { checkLinear, opt, req, resolveConversion, type ResolvedConversion } from './common';
import { estimateMarginRaw } from './margin';
import { roundQuantityDown, type QuantityStatus } from './quantity';

export interface PositionSizeInput {
  profile: InstrumentProfile;
  accountCurrency: string;
  /** Explicitly chosen basis for the account figure. */
  accountBasis: 'balance' | 'equity';
  accountAmount: string;
  riskMode: 'percent' | 'cash';
  riskValue: string;
  direction: 'long' | 'short';
  entry: string;
  stop: string;
  /** Manual settlement→account conversion rate, when required. */
  conversionRate?: string | null;
  /** Modeled round-turn commission per 1 quantity unit, in account currency. */
  commissionPerQuantity?: string | null;
  /** Modeled fixed commission per trade, in account currency. */
  commissionFixed?: string | null;
  /** Modeled adverse slippage on the stop, in price units. */
  slippage?: string | null;
  leverageOverride?: string | null;
}

export interface PositionSizeOutput {
  status: QuantityStatus;
  quantity: Dec | null;
  rawQuantity: Dec;
  riskBudget: Dec;
  /** Risk modelled at the stop for the rounded quantity, including modelled costs. */
  modeledRisk: Dec | null;
  modeledRiskPercent: Dec | null;
  stopDistance: Dec;
  stopTicks: Dec;
  stopOnTick: boolean;
  stopPips: Dec | null;
  lossPerQuantity: Dec;
  conversion: ResolvedConversion;
  margin: { status: 'estimated'; amount: Dec } | { status: 'unsupported'; reason: string } | null;
  notional: Dec | null;
  assumptions: string[];
}

export function calculatePositionSize(input: PositionSizeInput): Result<PositionSizeOutput> {
  const e: FieldError[] = [];
  const p: InstrumentProfile = input.profile;
  checkLinear(p, e);
  const amount = req('accountAmount', input.accountAmount, e, { positive: true });
  const riskValue = req('riskValue', input.riskValue, e, { positive: true });
  const entry = req('entry', input.entry, e, { positive: true });
  const stop = req('stop', input.stop, e, { positive: true });
  const commPerQty = opt('commissionPerQuantity', input.commissionPerQuantity, e, { nonNegative: true });
  const commFixed = opt('commissionFixed', input.commissionFixed, e, { nonNegative: true });
  const slippage = opt('slippage', input.slippage, e, { nonNegative: true });
  if (e.length || !amount || !riskValue || !entry || !stop) return fail(e);

  if (input.riskMode === 'percent' && riskValue.gt(100)) e.push(err('riskValue', 'error.percentMax100'));
  if (entry.eq(stop)) e.push(err('stop', 'error.stopEqualsEntry'));
  else if (input.direction === 'long' && stop.gt(entry)) e.push(err('stop', 'error.longStopAboveEntry'));
  else if (input.direction === 'short' && stop.lt(entry)) e.push(err('stop', 'error.shortStopBelowEntry'));
  const riskBudget = input.riskMode === 'percent' ? amount.mul(riskValue).div(100) : riskValue;
  if (riskBudget.gt(amount)) e.push(err('riskValue', 'error.riskExceedsAccount'));
  const conv = resolveConversion(p, input.accountCurrency, input.conversionRate, entry, e);
  if (e.length || !conv) return fail(e);

  const stopDistance = entry.minus(stop).abs();
  const multiplier = D(p.contractMultiplier);
  const lossPerQuantity = stopDistance.plus(slippage).mul(multiplier).mul(conv.rate).plus(commPerQty);
  const budgetAfterFixed = riskBudget.minus(commFixed);
  const rawQuantity = budgetAfterFixed.gt(0) ? budgetAfterFixed.div(lossPerQuantity) : D(0);
  const q = roundQuantityDown(rawQuantity, p);
  const modeledRisk = q.quantity ? q.quantity.mul(lossPerQuantity).plus(commFixed) : null;

  const tick = D(p.tickSize);
  const stopTicks = stopDistance.div(tick);
  const assumptions: string[] = ['assume.stopNotGuaranteed', `assume.basis.${input.accountBasis}`];
  if (conv.source === 'manual') assumptions.push('assume.manualConversion');
  if (conv.source === 'instrument_price') assumptions.push('assume.conversionFromEntry');
  if (p.verification === 'illustrative') assumptions.push('assume.illustrativeProfile');
  if (!commPerQty.isZero() || !commFixed.isZero() || !slippage.isZero()) assumptions.push('assume.costsModeled');
  else assumptions.push('assume.costsExcluded');

  let margin: PositionSizeOutput['margin'] = null;
  let notional: Dec | null = null;
  if (q.quantity) {
    const me: FieldError[] = [];
    const m = estimateMarginRaw(p, q.quantity, entry, input.accountCurrency, input.conversionRate, me, input.leverageOverride);
    if (m && 'unsupported' in m) margin = { status: 'unsupported', reason: m.unsupported };
    else if (m) {
      margin = { status: 'estimated', amount: m.margin };
      notional = m.notional;
    }
  }

  return ok({
    status: q.status,
    quantity: q.quantity,
    rawQuantity,
    riskBudget,
    modeledRisk,
    modeledRiskPercent: modeledRisk ? modeledRisk.div(amount).mul(100) : null,
    stopDistance,
    stopTicks,
    stopOnTick: stopTicks.isInteger(),
    stopPips: p.pipSize ? stopDistance.div(D(p.pipSize)) : null,
    lossPerQuantity,
    conversion: conv,
    margin,
    notional,
    assumptions,
  });
}
