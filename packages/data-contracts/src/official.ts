import type { CalendarEvent, CalendarProvider, ProviderInfo } from './calendar';
import { freshness } from './calendar';

/**
 * Central-bank policy decision DATES transcribed from the official pages listed
 * in `sources` on the retrieval date. Times of day are deliberately omitted
 * (not verified in this dataset). No actual/forecast/previous values are
 * provided. Importance 'high' is the app's own editorial classification for
 * policy-rate decisions, not a value supplied by the source.
 */
export const OFFICIAL_RETRIEVED_AT = '2026-10-14T00:00:00.000Z';

const FOMC = ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08'];
const ECB = ['2026-10-29', '2026-12-17', '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-10', '2027-07-22', '2027-09-09', '2027-10-28', '2027-12-16'];
const BOE = ['2026-02-05', '2026-03-19', '2026-04-30', '2026-06-18', '2026-07-30', '2026-09-17', '2026-11-05', '2026-12-17', '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-17', '2027-07-29', '2027-09-16', '2027-11-04', '2027-12-16'];

const SRC = {
  fomc: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
  ecb: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html',
  boe: 'https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates',
};

function ev(id: string, date: string, title: string, titleKey: string, country: string, currency: string, zone: string, url: string, note: string): CalendarEvent {
  return { id, providerId: 'official-cb', title, titleKey, country, currency, importance: 'high', date, dateZone: zone, time: null, timeKnown: false, actual: null, forecast: null, previous: null, unit: null, sourceUrl: url, isSample: false, userEntered: false, note };
}

export const OFFICIAL_EVENTS: CalendarEvent[] = [
  ...FOMC.map((d) => ev(`fomc-${d}`, d, 'FOMC policy statement (final day of meeting)', 'cal.fomc', 'US', 'USD', 'America/New_York', SRC.fomc, 'Federal Reserve meeting calendar; dates marked with * on the source have a Summary of Economic Projections.')),
  ...ECB.map((d) => ev(`ecb-${d}`, d, 'ECB Governing Council monetary policy meeting (day 2)', 'cal.ecb', 'EU', 'EUR', 'Europe/Berlin', SRC.ecb, 'ECB meetings calendar; only meetings listed on the page at retrieval are included.')),
  ...BOE.map((d) => ev(`boe-${d}`, d, 'Bank of England MPC announcement', 'cal.boe', 'GB', 'GBP', 'Europe/London', SRC.boe, 'Bank of England confirmed MPC dates.')),
];

export const officialInfo: ProviderInfo = {
  id: 'official-cb',
  nameKey: 'calendar.provider.official',
  kind: 'official_schedule',
  coverage: { descriptionKey: 'calendar.coverage.official', currencies: ['USD', 'EUR', 'GBP'], from: '2026-01-01', to: '2027-12-31', providesValues: false },
  attribution: 'Dates from the Federal Reserve Board (US public information), the European Central Bank and the Bank of England official websites. Verify on the source before relying on them; schedules can change.',
  sources: [
    { label: 'Federal Reserve — FOMC meeting calendars', url: SRC.fomc, retrievedAt: OFFICIAL_RETRIEVED_AT },
    { label: 'ECB — Governing Council meetings', url: SRC.ecb, retrievedAt: OFFICIAL_RETRIEVED_AT },
    { label: 'Bank of England — MPC dates', url: SRC.boe, retrievedAt: OFFICIAL_RETRIEVED_AT },
  ],
  // Re-verification is required 120 days after transcription.
  staleAfterMs: 120 * 86_400_000,
};

export const officialProvider: CalendarProvider = {
  info: officialInfo,
  async fetchRange(from, to, now) {
    return {
      providerId: officialInfo.id,
      status: freshness(officialInfo, OFFICIAL_RETRIEVED_AT, now, from, to),
      events: OFFICIAL_EVENTS.filter((e) => e.date >= from && e.date <= to),
      lastUpdated: OFFICIAL_RETRIEVED_AT,
      fetchedAt: now.toISOString(),
    };
  },
};

/** Development fixtures — always visibly labeled SAMPLE and never mixed in unless the user enables them. */
export const sampleInfo: ProviderInfo = {
  id: 'sample',
  nameKey: 'calendar.provider.sample',
  kind: 'sample',
  coverage: { descriptionKey: 'calendar.coverage.sample', currencies: ['USD', 'EUR', 'JPY'], from: null, to: null, providesValues: true },
  attribution: 'SAMPLE DATA — fabricated for UI testing. Not real economic data.',
  sources: [],
  staleAfterMs: null,
};

export function sampleProvider(): CalendarProvider {
  return {
    info: sampleInfo,
    async fetchRange(from, to, now) {
      const base = new Date(`${from}T00:00:00Z`);
      const mk = (offsetDays: number, hourUtc: number, title: string, currency: string, importance: CalendarEvent['importance'], actual: string | null, forecast: string | null, previous: string | null): CalendarEvent => {
        const d = new Date(base.getTime() + offsetDays * 86_400_000 + hourUtc * 3_600_000);
        return { id: `sample-${offsetDays}-${currency}`, providerId: 'sample', title: `[SAMPLE] ${title}`, titleKey: null, country: '—', currency, importance, date: d.toISOString().slice(0, 10), dateZone: 'UTC', time: d.toISOString(), timeKnown: true, actual, forecast, previous, unit: '%', sourceUrl: null, isSample: true, userEntered: false, note: 'Sample data' };
      };
      const events = [
        mk(0, 13, 'Sample inflation release', 'USD', 'high', null, '2.5', '2.6'),
        mk(1, 9, 'Sample sentiment index', 'EUR', 'medium', '48.1', null, '47.9'),
        mk(2, 0, 'Sample trade balance', 'JPY', 'low', null, null, null),
        mk(3, 15, 'Sample unknown-importance item', 'USD', 'unknown', null, null, null),
      ].filter((e) => e.date >= from && e.date <= to);
      return { providerId: 'sample', status: 'ok', events, lastUpdated: null, fetchedAt: now.toISOString() };
    },
  };
}

/** Wraps user-entered events (stored locally) as a provider. */
export function userProvider(load: () => Promise<CalendarEvent[]>): CalendarProvider {
  const info: ProviderInfo = {
    id: 'user',
    nameKey: 'calendar.provider.user',
    kind: 'user',
    coverage: { descriptionKey: 'calendar.coverage.user', currencies: [], from: null, to: null, providesValues: true },
    attribution: 'Entered by you on this device.',
    sources: [],
    staleAfterMs: null,
  };
  return {
    info,
    async fetchRange(from, to, now) {
      const all = await load();
      return { providerId: 'user', status: 'ok', events: all.filter((e) => e.date >= from && e.date <= to), lastUpdated: null, fetchedAt: now.toISOString() };
    },
  };
}
