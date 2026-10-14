import { describe, expect, it } from 'vitest';
import { CRYPTO_SESSION, EXCHANGE_SESSIONS, FX_SESSIONS, dayRange, intervalsBetween, overlaps, sessionLabelAt, sessionStatus, type SessionDef } from '../src';

const at = (iso: string) => Date.parse(iso);
const get = (id: string) => [...FX_SESSIONS, ...EXCHANGE_SESSIONS].find((s) => s.id === id)!;
const ldn = get('fx-london');
const ny = get('fx-newyork');
const syd = get('fx-sydney');
const hoursOf = (o: { start: number; end: number }[]) => o.reduce((s, x) => s + (x.end - x.start), 0) / 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('DST', () => {
  it('London/New York overlap is 4h in winter and summer', () => {
    const w = dayRange('2026-01-14', 'UTC');
    expect(hoursOf(overlaps([ldn, ny], w.start, w.end))).toBe(4);
    const s = dayRange('2026-07-15', 'UTC');
    expect(hoursOf(overlaps([ldn, ny], s.start, s.end))).toBe(4);
  });
  it('US/UK DST mismatch week (US switched 8 Mar 2026, UK 29 Mar) gives a 5h overlap', () => {
    const d = dayRange('2026-03-18', 'UTC');
    const o = overlaps([ldn, ny], d.start, d.end);
    expect(hoursOf(o)).toBe(5);
    expect(iso(o[0]!.start)).toBe('2026-03-18T12:00:00.000Z');
    expect(iso(o[0]!.end)).toBe('2026-03-18T17:00:00.000Z');
  });
  it('autumn mismatch (UK back 25 Oct 2026, US 1 Nov) gives 5h too', () => {
    const d = dayRange('2026-10-28', 'UTC');
    expect(hoursOf(overlaps([ldn, ny], d.start, d.end))).toBe(5);
  });
  it('Sydney open moves from 20:00Z (AEDT) to 21:00Z (AEST) after 5 Apr 2026', () => {
    const before = intervalsBetween(syd, at('2026-03-30T00:00:00Z'), at('2026-03-31T00:00:00Z'));
    expect(before.map((i) => iso(i.start))).toContain('2026-03-30T20:00:00.000Z'); // Tue 31 Mar 07:00 AEDT
    const after = intervalsBetween(syd, at('2026-04-06T00:00:00Z'), at('2026-04-07T00:00:00Z'));
    expect(after.map((i) => iso(i.start))).toContain('2026-04-06T21:00:00.000Z'); // Tue 7 Apr 07:00 AEST
  });
  it('Sydney spring transition (4 Oct 2026) shifts back to 20:00Z', () => {
    const ivs = intervalsBetween(syd, at('2026-10-05T00:00:00Z'), at('2026-10-06T00:00:00Z'));
    expect(ivs.map((i) => iso(i.start))).toContain('2026-10-05T20:00:00.000Z');
  });
});

describe('status and weekends', () => {
  it('London open on a Wednesday, closed Saturday with next open Monday 08:00 local', () => {
    expect(sessionStatus(ldn, at('2026-07-15T10:00:00Z')).open).toBe(true);
    const sat = sessionStatus(ldn, at('2026-07-18T10:00:00Z'));
    expect(sat.open).toBe(false);
    expect(iso(sat.nextOpen!)).toBe('2026-07-20T07:00:00.000Z');
  });
  it('Sydney Monday session starts on Sunday UTC', () => {
    const s = sessionStatus(syd, at('2026-07-19T22:00:00Z')); // Sun 22:00Z = Mon 08:00 AEST
    expect(s.open).toBe(true);
    expect(iso(s.closesAt!)).toBe('2026-07-20T06:00:00.000Z');
  });
  it('overnight user window crossing midnight', () => {
    const def: SessionDef = { id: 'u', name: 'Mine', kind: 'user', zone: 'Asia/Tehran', days: [1, 2, 3, 4, 5], windows: [{ open: '22:00', close: '02:00' }] };
    // Tehran is UTC+3:30 (no DST since 2022). Tue 23:30 local = 20:00Z
    const s = sessionStatus(def, at('2026-07-14T20:00:00Z'));
    expect(s.open).toBe(true);
    expect(iso(s.closesAt!)).toBe('2026-07-14T22:30:00.000Z');
  });
  it('crypto is always open', () => {
    expect(sessionStatus(CRYPTO_SESSION, at('2026-07-18T03:00:00Z')).open).toBe(true);
  });
  it('TSE lunch break is closed', () => {
    const tse = get('ex-tse');
    expect(sessionStatus(tse, at('2026-07-15T03:00:00Z')).open).toBe(false); // 12:00 JST
    expect(sessionStatus(tse, at('2026-07-15T04:00:00Z')).open).toBe(true); // 13:00 JST
  });
  it('labels entry sessions', () => {
    expect(sessionLabelAt(FX_SESSIONS, at('2026-07-15T13:00:00Z'))).toBe('fx-london+fx-newyork');
    expect(sessionLabelAt(FX_SESSIONS, at('2026-07-18T13:00:00Z'))).toBe('off');
  });
  it('London has a 23-hour day on 29 Mar 2026', () => {
    const r = dayRange('2026-03-29', 'Europe/London');
    expect((r.end - r.start) / 3_600_000).toBe(23);
  });
});
