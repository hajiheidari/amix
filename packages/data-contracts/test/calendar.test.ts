import { describe, expect, it } from 'vitest';
import { aggregate, freshness, officialInfo, officialProvider, sampleProvider, userProvider, type CalendarProvider } from '../src';

const q = { from: '2026-10-01', to: '2026-12-31', currencies: [], minImportance: 'all' as const };

describe('calendar', () => {
  it('official dataset has no manufactured values and no invented times', async () => {
    const r = await officialProvider.fetchRange('2026-01-01', '2027-12-31', new Date('2026-10-14T00:00:00Z'));
    expect(r.events.length).toBe(42);
    for (const e of r.events) {
      expect(e.actual).toBeNull();
      expect(e.forecast).toBeNull();
      expect(e.previous).toBeNull();
      expect(e.timeKnown).toBe(false);
      expect(e.isSample).toBe(false);
      expect(e.sourceUrl).toMatch(/^https:\/\//);
    }
  });
  it('flags stale data and out-of-coverage ranges', async () => {
    expect(freshness(officialInfo, '2026-10-14T00:00:00Z', new Date('2027-06-01T00:00:00Z'), '2027-06-01', '2027-06-30')).toBe('stale');
    expect(freshness(officialInfo, '2026-10-14T00:00:00Z', new Date('2026-10-20T00:00:00Z'), '2028-01-01', '2028-01-31')).toBe('out_of_coverage');
    const r = await officialProvider.fetchRange('2026-10-01', '2026-10-31', new Date('2026-10-20T00:00:00Z'));
    expect(r.status).toBe('ok');
  });
  it('an outage in one provider does not hide others', async () => {
    const broken: CalendarProvider = { info: { ...officialInfo, id: 'broken' }, fetchRange: async () => { throw new Error('network'); } };
    const r = await aggregate([broken, officialProvider], q, new Date('2026-10-14T00:00:00Z'));
    expect(r.results.find((x) => x.providerId === 'broken')!.status).toBe('error');
    expect(r.events.some((e) => e.id === 'fomc-2026-10-28')).toBe(true);
  });
  it('filters by currency and importance; sample data is labeled', async () => {
    const r = await aggregate([officialProvider, sampleProvider()], { ...q, currencies: ['USD'], minImportance: 'high' }, new Date('2026-10-14T00:00:00Z'));
    expect(r.events.every((e) => e.currency === 'USD' && e.importance === 'high')).toBe(true);
    const s = await sampleProvider().fetchRange('2026-10-01', '2026-10-10', new Date());
    expect(s.events.every((e) => e.isSample && e.title.startsWith('[SAMPLE]'))).toBe(true);
    expect(s.events.some((e) => e.importance === 'unknown')).toBe(true);
  });
  it('user provider returns stored events in range', async () => {
    const p = userProvider(async () => [{ ...(await officialProvider.fetchRange('2026-10-28', '2026-10-28', new Date())).events[0]!, id: 'u1', providerId: 'user', userEntered: true }]);
    expect((await p.fetchRange('2026-10-01', '2026-10-31', new Date())).events).toHaveLength(1);
  });
});
