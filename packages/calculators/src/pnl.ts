import { Dec, fail, ok, type FieldError, type InstrumentProfile, type Result } from '@tc/domain';
import { checkLinear, dirSign, opt, req, resolveConversion, valuePerPoint, type ResolvedConversion } from './common';

export interface PnlInput {
  profile: InstrumentProfile;
  accountCurrency: string;
  direction: 'long' | 'short';
  quantity: string;
  entry: string;
  exit: string;
  conversionRate?: string | null;
  /** Round-turn commission per quantity unit (account currency). */
  commissionPerQuantity?: string | null;
  commissionFixed?: string | null;
  /** Swap/financing: positive = cost, negative = credit (account currency). */
  swap?: string | null;
}

export interface PnlOutput {
  priceMove: Dec;
  grossSettlement: Dec;
  grossAccount: Dec;
  costs: Dec;
  net: Dec;
  conversion: ResolvedConversion;
}

export function calculatePnl(input: PnlInput): Result<PnlOutput> {
  const e: FieldError[] = [];
  checkLinear(input.profile, e);
  const qty = req('quantity', input.quantity, e, { positive: true });
  const entry = req('entry', input.entry, e, { positive: true });
  const exit = req('exit', input.exit, e, { positive: true });
  const cpq = opt('commissionPerQuantity', input.commissionPerQuantity, e, { nonNegative: true });
  const cf = opt('commissionFixed', input.commissionFixed, e, { nonNegative: true });
  const swap = opt('swap', input.swap, e);
  if (e.length || !qty || !entry || !exit) return fail(e);
  const conv = resolveConversion(input.profile, input.accountCurrency, input.conversionRate, exit, e);
  if (!conv) return fail(e);
  const priceMove = exit.minus(entry).mul(dirSign(input.direction));
  const grossSettlement = priceMove.mul(valuePerPoint(input.profile, qty));
  const grossAccount = grossSettlement.mul(conv.rate);
  const costs = cpq.mul(qty).plus(cf).plus(swap);
  return ok({ priceMove, grossSettlement, grossAccount, costs, net: grossAccount.minus(costs), conversion: conv });
}
