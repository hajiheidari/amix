import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { aggregate, officialInfo, officialProvider, sampleInfo, sampleProvider, userProvider, type AggregateResult, type CalendarEvent, type Importance } from '@tc/data-contracts';
import { newId } from '@tc/domain';
import { put, del } from '@tc/storage';
import { Card, Checkbox, EmptyState, Field, Notice, Num, Segmented, Select, TextInput, useI18n } from '@tc/ui';
import { useStore } from '../state/store';
import { useAppUi } from '../components/AppContext';

type Range = 'week' | 'next' | 'month';

export function useCalendar(rangeDays: number, startToday = true): AggregateResult | null {
  const { settings, data } = useStore();
  const i = useI18n();
  const [res, setRes] = useState<AggregateResult | null>(null);
  const from = DateTime.now().setZone(i.zone).startOf(startToday ? 'day' : 'week');
  const fromIso = from.toISODate()!;
  const toIso = from.plus({ days: rangeDays - 1 }).toISODate()!;
  const providers = useMemo(() => [officialProvider, userProvider(async () => data.userEvents), ...(settings.calendar.showSample ? [sampleProvider()] : [])], [data.userEvents, settings.calendar.showSample]);
  useEffect(() => {
    let live = true;
    void aggregate(providers, { from: fromIso, to: toIso, currencies: settings.calendar.currencies, minImportance: settings.calendar.minImportance }).then((r) => live && setRes(r));
    return () => {
      live = false;
    };
  }, [providers, fromIso, toIso, settings.calendar.currencies, settings.calendar.minImportance]);
  return res;
}

export function eventTitle(t: (k: string) => string, e: CalendarEvent): string {
  return e.titleKey ? t(e.titleKey) : e.title;
}

export function CalendarScreen() {
  const i = useI18n();
  const ui = useAppUi();
  const { settings, updateSettings, commit } = useStore();
  const [range, setRange] = useState<Range>('next');
  const res = useCalendar(range === 'month' ? 30 : 7, range !== 'week');
  const cal = settings.calendar;
  const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY'];
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of res?.events ?? []) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const infos = [officialInfo, ...(cal.showSample ? [sampleInfo] : [])];

  return (
    <div className="page">
      <h1>{i.t('cal.title')}</h1>
      <p className="muted">{i.t('cal.help')}</p>
      <Notice kind="warn">{i.t('cal.unresolved')}</Notice>
      <Card>
        <Segmented label={i.t('common.date')} value={range} onChange={setRange} options={[{ value: 'week', label: i.t('cal.range.week') }, { value: 'next', label: i.t('cal.range.next') }, { value: 'month', label: i.t('cal.range.month') }]} />
        <Select label={i.t('cal.minImportance')} value={cal.minImportance} onChange={(v) => void updateSettings({ calendar: { ...cal, minImportance: v } })} options={[{ value: 'all', label: i.t('common.all') }, { value: 'low', label: i.t('cal.imp.low') }, { value: 'medium', label: i.t('cal.imp.medium') }, { value: 'high', label: i.t('cal.imp.high') }]} />
        <fieldset className="chips">
          <legend>{i.t('cal.currencies')}</legend>
          {currencies.map((c) => (
            <Checkbox key={c} label={<Num>{c}</Num>} checked={cal.currencies.includes(c)} onChange={(on) => void updateSettings({ calendar: { ...cal, currencies: on ? [...cal.currencies, c] : cal.currencies.filter((x) => x !== c) } })} />
          ))}
        </fieldset>
        <Checkbox label={i.t('cal.showSample')} checked={cal.showSample} onChange={(v) => void updateSettings({ calendar: { ...cal, showSample: v } })} />
        {cal.showSample && <Notice kind="warn">{i.t('cal.sampleWarning')}</Notice>}
      </Card>
      {res && byDate.size === 0 && <EmptyState>{i.t('cal.noEvents')}</EmptyState>}
      {[...byDate.entries()].map(([date, evs]) => (
        <Card key={date} title={<Num>{i.dateTime(`${date}T12:00:00Z`, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }, 'UTC')}</Num>}>
          <ul className="events">
            {evs.map((e) => (
              <li key={e.id} className={`event ${e.isSample ? 'sample' : ''}`}>
                <span className={`imp imp-${e.importance}`} title={i.t(`cal.imp.${e.importance}`)}>
                  {i.t(`cal.imp.${e.importance}`)}
                </span>
                <span className="ev-time">
                  <Num>{e.timeKnown && e.time ? i.dateTime(e.time, { hour: '2-digit', minute: '2-digit' }) : i.t('cal.timeUnknown')}</Num>
                </span>
                <span className="ev-ccy">
                  <Num>{e.currency}</Num>
                </span>
                <span className="ev-title">
                  {e.isSample && <span className="badge warn">{i.t('common.sample')}</span>} {eventTitle(i.t, e)}
                  {e.sourceUrl && (
                    <>
                      {' '}
                      <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="small">
                        {i.t('cal.openSource')}
                      </a>
                    </>
                  )}
                </span>
                {(e.actual !== null || e.forecast !== null || e.previous !== null) && (
                  <span className="ev-values small">
                    {i.t('cal.actual')}: <Num>{e.actual ?? '—'}</Num> · {i.t('cal.forecast')}: <Num>{e.forecast ?? '—'}</Num> · {i.t('cal.previous')}: <Num>{e.previous ?? '—'}</Num>
                  </span>
                )}
                {e.userEntered && (
                  <button
                    className="btn small danger"
                    onClick={async () => {
                      await commit([del('userEvents', e.id)]);
                      ui.toast({ text: i.t('common.deleted'), action: { label: i.t('common.undo'), run: () => void commit([put('userEvents', e)]) } });
                    }}
                  >
                    {i.t('common.delete')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <AddEvent />
      <Card title={i.t('cal.sources')}>
        <ul className="plain sources">
          {infos.map((info) => {
            const r = res?.results.find((x) => x.providerId === info.id);
            return (
              <li key={info.id}>
                <div className="row between">
                  <strong>{i.t(info.nameKey)}</strong>
                  {r && <span className={`badge ${r.status === 'ok' ? 'ok' : 'warn'}`}>{i.t(`cal.status.${r.status}`)}</span>}
                </div>
                <p className="small">{i.t(info.coverage.descriptionKey)}</p>
                {r?.lastUpdated && <p className="small muted">{i.t('cal.lastUpdated', { date: i.dateTime(r.lastUpdated, { dateStyle: 'medium' }) })}</p>}
                <p className="small muted" dir="ltr">
                  {info.attribution}
                </p>
                <ul className="small">
                  {info.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" dir="ltr">
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function AddEvent() {
  const i = useI18n();
  const ui = useAppUi();
  const { commit } = useStore();
  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [importance, setImportance] = useState<Importance>('unknown');
  const [submitted, setSubmitted] = useState(false);
  const errs = { title: title.trim() ? null : i.t('error.required'), date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? null : i.t('error.invalidDate'), currency: /^[A-Z]{3}$/.test(currency) ? null : i.t('error.currencyCode') };
  return (
    <Card title={i.t('cal.addEvent')}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitted(true);
          if (Object.values(errs).some(Boolean)) return;
          const at = time ? DateTime.fromISO(`${date}T${time}`, { zone: i.zone }) : null;
          const ev: CalendarEvent = { id: newId('ev'), providerId: 'user', title: title.trim(), titleKey: null, country: '', currency, importance, date, dateZone: i.zone, time: at?.isValid ? at.toUTC().toISO() : null, timeKnown: !!at?.isValid, actual: null, forecast: null, previous: null, unit: null, sourceUrl: null, isSample: false, userEntered: true, note: '' };
          await commit([put('userEvents', ev)]);
          setTitle('');
          setSubmitted(false);
          ui.toast({ text: i.t('common.saved'), kind: 'ok' });
        }}
        noValidate
      >
        <div className="grid2">
          <TextInput label={i.t('cal.eventTitle')} value={title} onChange={setTitle} error={submitted ? errs.title : null} />
          <TextInput label={i.t('common.currency')} value={currency} ltr onChange={(v) => setCurrency(v.toUpperCase().trim())} error={submitted ? errs.currency : null} />
          <Field label={i.t('common.date')} error={submitted ? errs.date : null}>
            {(p) => <input {...p} className="input" type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label={i.t('common.time')} optional>
            {(p) => <input {...p} className="input" type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
          <Select<Importance> label={i.t('cal.importance')} value={importance} onChange={setImportance} options={(['high', 'medium', 'low', 'unknown'] as const).map((x) => ({ value: x, label: i.t(`cal.imp.${x}`) }))} />
        </div>
        <button className="btn" type="submit">
          {i.t('common.add')}
        </button>
      </form>
    </Card>
  );
}
