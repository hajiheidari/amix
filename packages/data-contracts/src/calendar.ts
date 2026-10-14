export type Importance = 'high' | 'medium' | 'low' | 'unknown';

export interface CalendarEvent {
  id: string;
  providerId: string;
  /** Source-language title. */
  title: string;
  /** Optional i18n key used to show a translated title for well-known official events. */
  titleKey: string | null;
  country: string; // ISO 3166-1 alpha-2 or region code such as 'EU'
  currency: string;
  importance: Importance;
  /** UTC instant if a time of day is known; otherwise the date in `date` with timeKnown=false. */
  date: string; // YYYY-MM-DD (in `dateZone`)
  dateZone: string; // IANA zone the date refers to
  time: string | null; // ISO instant when known
  timeKnown: boolean;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  sourceUrl: string | null;
  isSample: boolean;
  userEntered: boolean;
  note: string;
}

export interface ProviderCoverage {
  /** i18n key describing coverage. */
  descriptionKey: string;
  currencies: string[];
  from: string | null; // YYYY-MM-DD
  to: string | null;
  providesValues: boolean; // actual/forecast/previous
}

export interface ProviderInfo {
  id: string;
  nameKey: string;
  kind: 'official_schedule' | 'user' | 'sample' | 'embed';
  coverage: ProviderCoverage;
  /** Human-readable source/licence statement (shown in the UI). */
  attribution: string;
  sources: { label: string; url: string; retrievedAt: string }[];
  /** After this many ms since last update, data is flagged stale. null = static dataset with explicit coverage end. */
  staleAfterMs: number | null;
}

export type FetchStatus = 'ok' | 'stale' | 'out_of_coverage' | 'error';

export interface ProviderResult {
  providerId: string;
  status: FetchStatus;
  events: CalendarEvent[];
  lastUpdated: string | null; // when the underlying data was last updated/verified
  fetchedAt: string;
  errorCode?: string;
}

export interface CalendarProvider {
  info: ProviderInfo;
  fetchRange(fromDate: string, toDate: string, now: Date): Promise<ProviderResult>;
}

export interface CalendarQuery {
  from: string;
  to: string;
  currencies: string[]; // empty = all
  minImportance: 'all' | 'low' | 'medium' | 'high';
}

const RANK: Record<Importance, number> = { unknown: 0, low: 1, medium: 2, high: 3 };

export function filterEvents(events: CalendarEvent[], q: CalendarQuery): CalendarEvent[] {
  const min = q.minImportance === 'all' ? -1 : RANK[q.minImportance];
  return events
    .filter((e) => e.date >= q.from && e.date <= q.to)
    .filter((e) => q.currencies.length === 0 || q.currencies.includes(e.currency))
    .filter((e) => min < 0 || RANK[e.importance] >= min)
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
}

export interface AggregateResult {
  events: CalendarEvent[];
  results: ProviderResult[];
}

/** Query several providers; a failing provider never hides the others. */
export async function aggregate(providers: CalendarProvider[], q: CalendarQuery, now = new Date()): Promise<AggregateResult> {
  const results = await Promise.all(
    providers.map(async (p): Promise<ProviderResult> => {
      try {
        return await p.fetchRange(q.from, q.to, now);
      } catch (e) {
        return { providerId: p.info.id, status: 'error', events: [], lastUpdated: null, fetchedAt: now.toISOString(), errorCode: e instanceof Error ? e.message : 'unknown' };
      }
    }),
  );
  return { events: filterEvents(results.flatMap((r) => r.events), q), results };
}

export function freshness(info: ProviderInfo, lastUpdated: string | null, now: Date, from: string, to: string): FetchStatus {
  if (info.coverage.to && from > info.coverage.to) return 'out_of_coverage';
  if (info.coverage.from && to < info.coverage.from) return 'out_of_coverage';
  if (info.staleAfterMs !== null) {
    if (!lastUpdated) return 'stale';
    if (now.getTime() - Date.parse(lastUpdated) > info.staleAfterMs) return 'stale';
  }
  return 'ok';
}
