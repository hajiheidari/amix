import { D, Dec, floorToStep, type InstrumentProfile } from '@tc/domain';

export type QuantityStatus = 'ok' | 'below_minimum' | 'capped_at_maximum';

export interface QuantityResult {
  status: QuantityStatus;
  quantity: Dec | null;
}

/**
 * Round DOWN to the profile's quantity step. A result below the minimum is
 * "no valid position" — it is never rounded up. Above the maximum the size is
 * capped (which lowers risk, never raises it).
 */
export function roundQuantityDown(raw: Dec, profile: InstrumentProfile): QuantityResult {
  const step = D(profile.quantityStep);
  const min = D(profile.minQuantity);
  const max = profile.maxQuantity ? D(profile.maxQuantity) : null;
  if (raw.lte(0)) return { status: 'below_minimum', quantity: null };
  let q = floorToStep(raw, step);
  let status: QuantityStatus = 'ok';
  if (max && q.gt(max)) {
    q = floorToStep(max, step);
    status = 'capped_at_maximum';
  }
  if (q.lt(min) || q.lte(0)) return { status: 'below_minimum', quantity: null };
  return { status, quantity: q };
}

export function isValidQuantity(q: Dec, profile: InstrumentProfile): boolean {
  const step = D(profile.quantityStep);
  if (q.lt(D(profile.minQuantity))) return false;
  if (profile.maxQuantity && q.gt(D(profile.maxQuantity))) return false;
  return q.mod(step).isZero();
}
