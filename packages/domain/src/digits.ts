/**
 * Locale-digit normalization. Persian (U+06F0–U+06F9) and Arabic-Indic
 * (U+0660–U+0669) digits are mapped to ASCII; Arabic decimal/thousands
 * separators, bidi control marks and Unicode minus signs are normalized.
 */
const PERSIAN_ZERO = 0x06f0;
const ARABIC_ZERO = 0x0660;
const BIDI_MARKS = /[\u200e\u200f\u061c‪-‮⁦-⁩]/g;

export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) out += String(code - PERSIAN_ZERO);
    else if (code >= ARABIC_ZERO && code <= ARABIC_ZERO + 9) out += String(code - ARABIC_ZERO);
    else out += ch;
  }
  return out;
}

/**
 * Normalize a user-typed numeric string to canonical form: ASCII digits,
 * '.' as decimal separator, optional leading '-', no grouping.
 * Returns null when the text is not a plain decimal number.
 */
export function normalizeNumericInput(input: string): string | null {
  let s = normalizeDigits(input).replace(BIDI_MARKS, '').trim();
  s = s.replace(/[−‒–‐﹣－]/g, '-'); // minus variants
  s = s.replace(/\u066b/g, '.'); // Arabic decimal separator
  s = s.replace(/[\u066c,\s\u00a0\u202f']/g, ''); // grouping separators
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  if (s.startsWith('.')) s = '0' + s;
  if (s.startsWith('-.')) s = '-0' + s.slice(1);
  if (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}

export type NumeralSystem = 'latn' | 'arab' | 'arabext';

const NUMERAL_ZERO: Record<NumeralSystem, number> = { latn: 0x30, arab: ARABIC_ZERO, arabext: PERSIAN_ZERO };

export function toNumerals(ascii: string, system: NumeralSystem): string {
  if (system === 'latn') return ascii;
  const zero = NUMERAL_ZERO[system];
  let out = '';
  for (const ch of ascii) {
    if (ch >= '0' && ch <= '9') out += String.fromCodePoint(zero + (ch.charCodeAt(0) - 48));
    else if (ch === '.') out += '\u066b';
    else if (ch === ',') out += '\u066c';
    else if (ch === '-') out += '−';
    else out += ch;
  }
  return out;
}
