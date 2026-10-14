import Decimal from 'decimal.js';
import { normalizeNumericInput } from './digits';

/** Isolated Decimal constructor so global configuration cannot leak. */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -30, toExpPos: 40 });
export type Dec = InstanceType<typeof Dec>;

/** Decimal values are persisted as canonical plain strings. */
export type DecimalString = string;

export function D(value: Dec | DecimalString | number): Dec {
  return new Dec(value);
}

export function parseDecimal(input: string | null | undefined): Dec | null {
  if (input === null || input === undefined) return null;
  const n = normalizeNumericInput(String(input));
  if (n === null) return null;
  const d = new Dec(n);
  return d.isFinite() ? d : null;
}

/** Canonical string without exponent notation and without trailing zeros. */
export function toPlain(d: Dec): DecimalString {
  const s = d.toFixed();
  return s === '-0' ? '0' : s;
}

export function roundTo(d: Dec, dp: number): DecimalString {
  return toPlain(d.toDecimalPlaces(dp, Dec.ROUND_HALF_EVEN));
}

/** Largest multiple of step that is <= value (value, step > 0). */
export function floorToStep(value: Dec, step: Dec): Dec {
  return value.div(step).floor().mul(step);
}

export function isMultipleOf(value: Dec, step: Dec): boolean {
  return value.mod(step).isZero();
}
