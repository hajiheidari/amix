import { DateTime } from 'luxon';

/** HH:mm in the session's own IANA zone. */
export interface SessionWindow {
  open: string;
  close: string; // close <= open means the window crosses local midnight
}

export type SessionKind = 'fx_convention' | 'exchange_cash' | 'crypto_24_7' | 'user';

export interface SessionDef {
  id: string;
  /** i18n key or user label */
  name: string;
  kind: SessionKind;
  zone: string;
  /** ISO weekdays (1 = Mon … 7 = Sun) on which a window OPENS, in the session zone. */
  days: number[];
  windows: SessionWindow[];
  note?: string;
  color?: string;
}

export interface Interval {
  sessionId: string;
  start: number; // epoch ms
  end: number;
}

/**
 * Forex sessions are widely used conventions, not exchange hours. Brokers and
 * data vendors use different boundaries; users can edit or add windows.
 */
export const FX_SESSIONS: SessionDef[] = [
  { id: 'fx-sydney', name: 'session.sydney', kind: 'fx_convention', zone: 'Australia/Sydney', days: [1, 2, 3, 4, 5], windows: [{ open: '07:00', close: '16:00' }], color: '#7c5cff' },
  { id: 'fx-tokyo', name: 'session.tokyo', kind: 'fx_convention', zone: 'Asia/Tokyo', days: [1, 2, 3, 4, 5], windows: [{ open: '09:00', close: '18:00' }], color: '#e0527e' },
  { id: 'fx-london', name: 'session.london', kind: 'fx_convention', zone: 'Europe/London', days: [1, 2, 3, 4, 5], windows: [{ open: '08:00', close: '17:00' }], color: '#2f8fdd' },
  { id: 'fx-newyork', name: 'session.newYork', kind: 'fx_convention', zone: 'America/New_York', days: [1, 2, 3, 4, 5], windows: [{ open: '08:00', close: '17:00' }], color: '#1fa67a' },
];

/** Regular cash-market hours. Holidays and half-days are NOT modelled. */
export const EXCHANGE_SESSIONS: SessionDef[] = [
  { id: 'ex-asx', name: 'session.asx', kind: 'exchange_cash', zone: 'Australia/Sydney', days: [1, 2, 3, 4, 5], windows: [{ open: '10:00', close: '16:00' }], color: '#7c5cff' },
  { id: 'ex-tse', name: 'session.tse', kind: 'exchange_cash', zone: 'Asia/Tokyo', days: [1, 2, 3, 4, 5], windows: [{ open: '09:00', close: '11:30' }, { open: '12:30', close: '15:30' }], color: '#e0527e' },
  { id: 'ex-lse', name: 'session.lse', kind: 'exchange_cash', zone: 'Europe/London', days: [1, 2, 3, 4, 5], windows: [{ open: '08:00', close: '16:30' }], color: '#2f8fdd' },
  { id: 'ex-nyse', name: 'session.nyse', kind: 'exchange_cash', zone: 'America/New_York', days: [1, 2, 3, 4, 5], windows: [{ open: '09:30', close: '16:00' }], color: '#1fa67a' },
];

export const CRYPTO_SESSION: SessionDef = { id: 'crypto', name: 'session.crypto', kind: 'crypto_24_7', zone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], windows: [{ open: '00:00', close: '00:00' }], color: '#f0a020' };

function hm(s: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid time ${s}`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid time ${s}`);
  return { hour, minute };
}

export function isValidHm(s: string): boolean {
  try {
    hm(s);
    return true;
  } catch {
    return false;
  }
}

export function isValidZone(zone: string): boolean {
  return DateTime.now().setZone(zone).isValid;
}

/** Zoned wall-clock → instant. Luxon shifts nonexistent (spring-forward) times forward. */
function zoned(date: DateTime, t: string, zone: string): DateTime {
  const { hour, minute } = hm(t);
  return DateTime.fromObject({ year: date.year, month: date.month, day: date.day, hour, minute }, { zone });
}

/** All session intervals that overlap [fromMs, toMs]. */
export function intervalsBetween(def: SessionDef, fromMs: number, toMs: number): Interval[] {
  if (def.kind === 'crypto_24_7') return [{ sessionId: def.id, start: fromMs, end: toMs }];
  const out: Interval[] = [];
  const startDay = DateTime.fromMillis(fromMs, { zone: def.zone }).startOf('day').minus({ days: 2 });
  const endDay = DateTime.fromMillis(toMs, { zone: def.zone }).startOf('day').plus({ days: 1 });
  for (let d = startDay; d <= endDay; d = d.plus({ days: 1 })) {
    if (!def.days.includes(d.weekday)) continue;
    for (const w of def.windows) {
      const open = zoned(d, w.open, def.zone);
      const crosses = hm(w.close).hour * 60 + hm(w.close).minute <= hm(w.open).hour * 60 + hm(w.open).minute;
      const close = zoned(crosses ? d.plus({ days: 1 }) : d, w.close, def.zone);
      const s = open.toMillis();
      const e = close.toMillis();
      if (e > fromMs && s < toMs) out.push({ sessionId: def.id, start: s, end: e });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export interface SessionStatus {
  id: string;
  open: boolean;
  /** Close time of the current window, if open. */
  closesAt: number | null;
  /** Next opening strictly after `now` (searches 14 days). */
  nextOpen: number | null;
}

export function sessionStatus(def: SessionDef, now: number): SessionStatus {
  if (def.kind === 'crypto_24_7') return { id: def.id, open: true, closesAt: null, nextOpen: null };
  const horizon = now + 14 * 86_400_000;
  const ivs = intervalsBetween(def, now - 86_400_000, horizon);
  const cur = ivs.find((i) => i.start <= now && now < i.end) ?? null;
  const next = ivs.find((i) => i.start > now) ?? null;
  return { id: def.id, open: !!cur, closesAt: cur ? cur.end : null, nextOpen: next ? next.start : null };
}

export interface Overlap {
  a: string;
  b: string;
  start: number;
  end: number;
}

/** Pairwise overlaps of sessions within [fromMs, toMs). */
export function overlaps(defs: SessionDef[], fromMs: number, toMs: number): Overlap[] {
  const lists = defs.filter((d) => d.kind !== 'crypto_24_7').map((d) => intervalsBetween(d, fromMs, toMs));
  const out: Overlap[] = [];
  for (let i = 0; i < lists.length; i++) {
    for (let j = i + 1; j < lists.length; j++) {
      for (const x of lists[i]!) {
        for (const y of lists[j]!) {
          const s = Math.max(x.start, y.start, fromMs);
          const e = Math.min(x.end, y.end, toMs);
          if (e > s) out.push({ a: x.sessionId, b: y.sessionId, start: s, end: e });
        }
      }
    }
  }
  return out.sort((p, q) => p.start - q.start);
}

/** Which sessions are open at a given instant (used for analytics breakdowns). */
export function openSessionsAt(defs: SessionDef[], at: number): string[] {
  return defs.filter((d) => sessionStatus(d, at).open).map((d) => d.id);
}

/** Label for an entry time: e.g. 'fx-london+fx-newyork', or 'off' when none. */
export function sessionLabelAt(defs: SessionDef[], at: number): string {
  const ids = openSessionsAt(defs, at);
  return ids.length ? ids.join('+') : 'off';
}

/** Day boundaries for a calendar date in a zone (handles 23/25-hour DST days). */
export function dayRange(isoDate: string, zone: string): { start: number; end: number } {
  const d = DateTime.fromISO(isoDate, { zone }).startOf('day');
  return { start: d.toMillis(), end: d.plus({ days: 1 }).toMillis() };
}

export function resolveZone(pref: string): string {
  if (pref && pref !== 'device' && isValidZone(pref)) return pref;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function weekdayIn(at: number, zone: string): number {
  return DateTime.fromMillis(at, { zone }).weekday;
}

export function todayIn(zone: string, now = Date.now()): string {
  return DateTime.fromMillis(now, { zone }).toISODate() ?? '1970-01-01';
}

/** Commonly used zones for the picker; any valid IANA zone may be typed. */
export const COMMON_ZONES = [
  'UTC', 'Asia/Tehran', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Baghdad', 'Asia/Kuwait', 'Asia/Qatar', 'Africa/Cairo', 'Europe/Istanbul',
  'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Toronto',
  'Asia/Tokyo', 'Asia/Singapore', 'Asia/Hong_Kong', 'Australia/Sydney',
];

/** ISO instant → value for <input type="datetime-local"> in `zone`. */
export function isoToZonedInput(iso: string, zone: string): string {
  const d = DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone);
  return d.isValid ? d.toFormat("yyyy-MM-dd'T'HH:mm") : '';
}

/** <input type="datetime-local"> value interpreted in `zone` → ISO instant (UTC), or null. */
export function zonedInputToIso(value: string, zone: string): string | null {
  if (!value) return null;
  const d = DateTime.fromISO(value, { zone });
  return d.isValid ? d.toUTC().toISO() : null;
}
