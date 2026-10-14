import { D, Dec, err, fail, ok, parseDecimal, type FieldError, type InstrumentProfile, type Result } from '@tc/domain';
import { checkLinear, req, resolveConversion, type ResolvedConversion } from './common';

export interface MarginInput {
  profile: InstrumentProfile;
  quantity: string;
  price: string;
  accountCurrency: string;
  conversionRate?: string | null;
  /** Optional override of the profile leverage (only for the 'leverage' model). */
  leverageOverride?: string | null;
  freeMargin?: string | null;
}

export type MarginOutput =
  | {
      status: 'estimated';
      margin: Dec;
      notional: Dec | null;
      currency: string;
      model: InstrumentProfile['margin']['kind'];
      conversion: ResolvedConversion | null;
      freeMargin: Dec | null;
      freeMarginAfter: Dec | null;
      sufficient: boolean | null;
    }
  | { status: 'unsupported'; reason: string };

/** Pure margin estimate in account currency. Exact broker margin (tiers, hedging, portfolio rules) is NOT modelled. */
export function estimateMarginRaw(
  profile: InstrumentProfile,
  qty: Dec,
  price: Dec,
  accountCurrency: string,
  manualRate: string | null | undefined,
  errors: FieldError[],
  leverageOverride?: string | null,
): { margin: Dec; notional: Dec | null; conversion: ResolvedConversion | null } | { unsupported: string } | null {
  const m = profile.margin;
  if (m.kind === 'unsupported') return { unsupported: m.note ?? 'unsupported' };
  if (m.kind === 'fixed_per_quantity') {
    const amount = qty.mul(D(m.amount));
    if (m.currency === accountCurrency) return { margin: amount, notional: null, conversion: null };
    if (m.currency !== profile.settlementCurrency) {
      errors.push(err('conversionRate', 'error.conversionRequired', { from: m.currency, to: accountCurrency }));
      return null;
    }
    const conv = resolveConversion(profile, accountCurrency, manualRate, price, errors);
    return conv ? { margin: amount.mul(conv.rate), notional: null, conversion: conv } : null;
  }
  const notionalQuote = qty.mul(D(profile.contractMultiplier)).mul(price);
  const conv = resolveConversion(profile, accountCurrency, manualRate, price, errors);
  if (!conv) return null;
  const notional = notionalQuote.mul(conv.rate);
  if (m.kind === 'full_notional') return { margin: notional, notional, conversion: conv };
  if (m.kind === 'percent_notional') return { margin: notional.mul(D(m.percent)).div(100), notional, conversion: conv };
  const lev = leverageOverride && leverageOverride.trim() !== '' ? parseDecimal(leverageOverride) : D(m.leverage);
  if (!lev || !lev.gt(0)) {
    errors.push(err('leverage', 'error.mustBePositive'));
    return null;
  }
  return { margin: notional.div(lev), notional, conversion: conv };
}

export function calculateMargin(input: MarginInput): Result<MarginOutput> {
  const errors: FieldError[] = [];
  checkLinear(input.profile, errors);
  const qty = req('quantity', input.quantity, errors, { positive: true });
  const price = req('price', input.price, errors, { positive: true });
  const free = input.freeMargin && input.freeMargin.trim() !== '' ? req('freeMargin', input.freeMargin, errors) : null;
  if (errors.length || !qty || !price) return fail(errors);
  const r = estimateMarginRaw(input.profile, qty, price, input.accountCurrency, input.conversionRate, errors, input.leverageOverride);
  if (errors.length || !r) return fail(errors);
  if ('unsupported' in r) return ok({ status: 'unsupported', reason: r.unsupported });
  return ok({
    status: 'estimated',
    margin: r.margin,
    notional: r.notional,
    currency: input.accountCurrency,
    model: input.profile.margin.kind,
    conversion: r.conversion,
    freeMargin: free,
    freeMarginAfter: free ? free.minus(r.margin) : null,
    sufficient: free ? free.gte(r.margin) : null,
  });
}
