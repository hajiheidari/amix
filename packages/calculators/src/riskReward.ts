import { D, Dec, err, fail, ok, type FieldError, type InstrumentProfile, type Result } from '@tc/domain';
import { opt, req, resolveConversion } from './common';

export interface RiskRewardInput {
  direction: 'long' | 'short';
  entry: string;
  stop: string;
  target: string;
  /** Optional, for cost-adjusted cash figures. */
  profile?: InstrumentProfile | null;
  quantity?: string | null;
  accountCurrency?: string | null;
  conversionRate?: string | null;
  /** Total modeled round-trip costs in account currency. */
  costs?: string | null;
}

export interface RiskRewardOutput {
  riskDistance: Dec;
  rewardDistance: Dec;
  ratio: Dec;
  breakEvenWinRate: Dec; // percent, before costs
  cash: null | {
    risk: Dec;
    reward: Dec;
    costs: Dec;
    riskWithCosts: Dec;
    rewardAfterCosts: Dec;
    ratioAfterCosts: Dec | null;
  };
}

export function validateLevels(direction: 'long' | 'short', entry: Dec, stop: Dec, target: Dec | null, e: FieldError[]): void {
  if (stop.eq(entry)) e.push(err('stop', 'error.stopEqualsEntry'));
  else if (direction === 'long' && stop.gt(entry)) e.push(err('stop', 'error.longStopAboveEntry'));
  else if (direction === 'short' && stop.lt(entry)) e.push(err('stop', 'error.shortStopBelowEntry'));
  if (target) {
    if (target.eq(entry)) e.push(err('target', 'error.targetEqualsEntry'));
    else if (direction === 'long' && target.lt(entry)) e.push(err('target', 'error.longTargetBelowEntry'));
    else if (direction === 'short' && target.gt(entry)) e.push(err('target', 'error.shortTargetAboveEntry'));
  }
}

export function calculateRiskReward(input: RiskRewardInput): Result<RiskRewardOutput> {
  const e: FieldError[] = [];
  const entry = req('entry', input.entry, e, { positive: true });
  const stop = req('stop', input.stop, e, { positive: true });
  const target = req('target', input.target, e, { positive: true });
  if (e.length || !entry || !stop || !target) return fail(e);
  validateLevels(input.direction, entry, stop, target, e);
  if (e.length) return fail(e);
  const riskDistance = entry.minus(stop).abs();
  const rewardDistance = target.minus(entry).abs();
  const ratio = rewardDistance.div(riskDistance);
  const breakEvenWinRate = D(100).div(ratio.plus(1));
  let cash: RiskRewardOutput['cash'] = null;
  if (input.profile && input.quantity && input.quantity.trim() !== '' && input.accountCurrency) {
    const qty = req('quantity', input.quantity, e, { positive: true });
    const costs = opt('costs', input.costs, e, { nonNegative: true });
    const conv = qty ? resolveConversion(input.profile, input.accountCurrency, input.conversionRate, entry, e) : null;
    if (e.length || !qty || !conv) return fail(e);
    const perPoint = qty.mul(D(input.profile.contractMultiplier)).mul(conv.rate);
    const risk = riskDistance.mul(perPoint);
    const reward = rewardDistance.mul(perPoint);
    const riskWithCosts = risk.plus(costs);
    const rewardAfterCosts = reward.minus(costs);
    cash = { risk, reward, costs, riskWithCosts, rewardAfterCosts, ratioAfterCosts: riskWithCosts.gt(0) ? rewardAfterCosts.div(riskWithCosts) : null };
  }
  return ok({ riskDistance, rewardDistance, ratio, breakEvenWinRate, cash });
}

/** Target price for a desired reward:risk ratio. */
export function targetForRatio(direction: 'long' | 'short', entry: string, stop: string, ratio: string): Result<Dec> {
  const e: FieldError[] = [];
  const en = req('entry', entry, e, { positive: true });
  const st = req('stop', stop, e, { positive: true });
  const r = req('ratio', ratio, e, { positive: true });
  if (e.length || !en || !st || !r) return fail(e);
  validateLevels(direction, en, st, null, e);
  if (e.length) return fail(e);
  const dist = en.minus(st).abs().mul(r);
  const t = direction === 'long' ? en.plus(dist) : en.minus(dist);
  if (!t.gt(0)) return fail([err('ratio', 'error.targetNotPositive')]);
  return ok(t);
}
