import { D, Dec, fail, ok, type FieldError, type InstrumentProfile, type Result } from '@tc/domain';
import { checkLinear, req, resolveConversion, type ResolvedConversion } from './common';

export interface PipTickInput {
  profile: InstrumentProfile;
  quantity: string;
  accountCurrency: string;
  /** Needed only for FX pairs where the account currency is the base currency and no manual rate is given. */
  price?: string | null;
  conversionRate?: string | null;
}

export interface PipTickOutput {
  tickValueSettlement: Dec;
  tickValueAccount: Dec;
  pipValueSettlement: Dec | null;
  pipValueAccount: Dec | null;
  pointValueAccount: Dec;
  conversion: ResolvedConversion;
}

export function calculatePipTick(input: PipTickInput): Result<PipTickOutput> {
  const errors: FieldError[] = [];
  checkLinear(input.profile, errors);
  const qty = req('quantity', input.quantity, errors, { positive: true });
  const price = input.price && input.price.trim() !== '' ? req('price', input.price, errors, { positive: true }) : null;
  if (!qty) return fail(errors);
  const conv = resolveConversion(input.profile, input.accountCurrency, input.conversionRate, price, errors);
  if (errors.length || !conv) return fail(errors);
  const perPoint = qty.mul(D(input.profile.contractMultiplier));
  const tick = perPoint.mul(D(input.profile.tickSize));
  const pip = input.profile.pipSize ? perPoint.mul(D(input.profile.pipSize)) : null;
  return ok({
    tickValueSettlement: tick,
    tickValueAccount: tick.mul(conv.rate),
    pipValueSettlement: pip,
    pipValueAccount: pip ? pip.mul(conv.rate) : null,
    pointValueAccount: perPoint.mul(conv.rate),
    conversion: conv,
  });
}
