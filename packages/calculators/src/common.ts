import { D, Dec, err, parseDecimal, type FieldError, type InstrumentProfile } from '@tc/domain';

export type ConversionSource = 'identity' | 'manual' | 'instrument_price';

export interface ResolvedConversion {
  from: string;
  to: string;
  /** 1 unit of `from` = rate units of `to`. */
  rate: Dec;
  source: ConversionSource;
}

/**
 * Resolve the settlement→account conversion. A missing conversion is an
 * error — it never silently becomes 1.
 */
export function resolveConversion(
  profile: InstrumentProfile,
  accountCurrency: string,
  manualRate: string | null | undefined,
  price: Dec | null,
  errors: FieldError[],
  field = 'conversionRate',
): ResolvedConversion | null {
  const from = profile.settlementCurrency;
  const to = accountCurrency;
  if (from === to) return { from, to, rate: D(1), source: 'identity' };
  if (manualRate !== null && manualRate !== undefined && String(manualRate).trim() !== '') {
    const r = parseDecimal(manualRate);
    if (!r) errors.push(err(field, 'error.notANumber'));
    else if (!r.gt(0)) errors.push(err(field, 'error.mustBePositive'));
    else return { from, to, rate: r, source: 'manual' };
    return null;
  }
  // FX pair whose base currency is the account currency: quote→base = 1 / price.
  if (profile.assetClass === 'fx' && profile.baseCurrency === to && profile.quoteCurrency === from && price && price.gt(0)) {
    return { from, to, rate: D(1).div(price), source: 'instrument_price' };
  }
  errors.push(err(field, 'error.conversionRequired', { from, to }));
  return null;
}

export function req(field: string, v: string | null | undefined, errors: FieldError[], opts: { positive?: boolean; nonNegative?: boolean } = {}): Dec | null {
  if (v === null || v === undefined || String(v).trim() === '') {
    errors.push(err(field, 'error.required'));
    return null;
  }
  const d = parseDecimal(v);
  if (!d) {
    errors.push(err(field, 'error.notANumber'));
    return null;
  }
  if (opts.positive && !d.gt(0)) {
    errors.push(err(field, 'error.mustBePositive'));
    return null;
  }
  if (opts.nonNegative && d.lt(0)) {
    errors.push(err(field, 'error.mustBeNonNegative'));
    return null;
  }
  return d;
}

export function opt(field: string, v: string | null | undefined, errors: FieldError[], opts: { nonNegative?: boolean } = {}): Dec {
  if (v === null || v === undefined || String(v).trim() === '') return D(0);
  return req(field, v, errors, opts) ?? D(0);
}

export function checkLinear(profile: InstrumentProfile, errors: FieldError[]): void {
  if (profile.contractType !== 'linear') errors.push(err('profile', 'error.nonlinearUnsupported'));
}

export function dirSign(direction: 'long' | 'short'): number {
  return direction === 'long' ? 1 : -1;
}

/** Value (in settlement currency) of a 1-unit price move for `qty`. */
export function valuePerPoint(profile: InstrumentProfile, qty: Dec): Dec {
  return qty.mul(D(profile.contractMultiplier));
}
