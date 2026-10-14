export function newId(prefix = ''): string {
  const g = globalThis.crypto;
  const raw = g && 'randomUUID' in g ? g.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}_${raw}` : raw;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const CURRENCY_RE = /^[A-Z][A-Z0-9]{1,9}$/;
export function isCurrencyCode(s: string): boolean {
  return CURRENCY_RE.test(s);
}
