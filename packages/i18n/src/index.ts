import { en, type Dictionary, type MessageKey } from './en';
import { fa } from './fa';
import { ar } from './ar';

export { en, fa, ar };
export type { Dictionary, MessageKey };

export type Lang = 'en' | 'fa' | 'ar';
export type Numerals = 'latn' | 'arab' | 'arabext';

export const DICTIONARIES: Record<Lang, Dictionary> = { en, fa, ar };
export const LANGS: { code: Lang; native: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', native: 'English', dir: 'ltr' },
  { code: 'fa', native: 'فارسی', dir: 'rtl' },
  { code: 'ar', native: 'العربية', dir: 'rtl' },
];

export function dirOf(lang: Lang): 'ltr' | 'rtl' {
  return lang === 'en' ? 'ltr' : 'rtl';
}

export function defaultNumerals(lang: Lang): Numerals {
  return lang === 'fa' ? 'arabext' : lang === 'ar' ? 'arab' : 'latn';
}

/** BCP-47 locale with the Gregorian calendar forced (Persian calendar display is deferred). */
export function localeTag(lang: Lang, numerals: Numerals): string {
  const base = lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar' : 'en-GB';
  return `${base}-u-ca-gregory-nu-${numerals}`;
}

export type Params = Record<string, string | number>;

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function translate(lang: Lang, key: string, params?: Params): string {
  const dict = DICTIONARIES[lang] as Record<string, string>;
  const s = dict[key] ?? (en as Record<string, string>)[key];
  return s === undefined ? key : interpolate(s, params);
}

export function hasKey(key: string): key is MessageKey {
  return key in en;
}

export function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

const ZERO: Record<Numerals, number> = { latn: 0x30, arab: 0x0660, arabext: 0x06f0 };

/** Convert ASCII digits/separators to the selected numeral system. */
export function localizeDigits(ascii: string, numerals: Numerals): string {
  if (numerals === 'latn') return ascii;
  let out = '';
  for (const ch of ascii) {
    if (ch >= '0' && ch <= '9') out += String.fromCodePoint(ZERO[numerals] + ch.charCodeAt(0) - 48);
    else if (ch === '.') out += '٫';
    else if (ch === ',') out += '٬';
    else out += ch;
  }
  return out;
}

export interface NumberFormatOptions {
  /** Maximum fraction digits (rounded half-even by the caller's decimal type when needed). */
  maxDp?: number;
  minDp?: number;
  group?: boolean;
  sign?: boolean;
}

/**
 * Format a canonical decimal string ("-1234.5") without going through
 * floating point. Grouping uses the Western thousands pattern.
 */
export function formatDecimalString(value: string, numerals: Numerals, o: NumberFormatOptions = {}): string {
  const neg = value.startsWith('-');
  let [int = '0', frac = ''] = (neg ? value.slice(1) : value).split('.');
  if (o.maxDp !== undefined && frac.length > o.maxDp) frac = frac.slice(0, o.maxDp); // caller should round first
  if (o.minDp !== undefined) frac = frac.padEnd(o.minDp, '0');
  frac = frac.replace(/0+$/, (z) => (o.minDp !== undefined ? z.slice(0, Math.max(0, z.length - (frac.length - o.minDp))) : ''));
  if (o.group !== false) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const isZero = /^[0,]*$/.test(int) && /^0*$/.test(frac);
  const sign = neg && !isZero ? '-' : o.sign && !isZero ? '+' : '';
  return localizeDigits(`${sign}${int}${frac ? '.' + frac : ''}`, numerals).replace(/^-/, '−');
}
