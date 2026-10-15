import { useCallback, useEffect, useState } from 'react';
import { fetchCatalogFile, fetchCatalogIndex, isStale, parseMtExport, type CatalogEntry, type CatalogIndex, type MtExport } from '@tc/data-contracts';
import { Card, EmptyState, Notice, Num, useI18n } from '@tc/ui';
import { useStore } from '../state/store';
import { go, href } from '../state/router';
import { MtPreview } from './ImportMt';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' });

/** Pick a broker/account type from the weekly catalog and import its symbols. */
export function BrokerCatalog() {
  const i = useI18n();
  const { settings, updateSettings } = useStore();
  const [index, setIndex] = useState<CatalogIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<{ entry: CatalogEntry; exp: MtExport } | null>(null);
  const [loadingEntry, setLoadingEntry] = useState<string | null>(null);
  const sub = settings.brokerCatalog;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await fetchCatalogIndex(fetcher);
    setLoading(false);
    if (!r.ok) return setError(i.t(r.code));
    setIndex(r.value);
    await updateSettings({ brokerCatalog: { ...sub, lastCheckedAt: new Date().toISOString() } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const choose = async (entry: CatalogEntry) => {
    setLoadingEntry(entry.id);
    const text = await fetchCatalogFile(fetcher, entry);
    setLoadingEntry(null);
    const r = text ? parseMtExport(text) : null;
    if (!r || !r.ok) return setError(i.t('cat.loadFailed'));
    setChosen({ entry, exp: r.value });
  };

  if (chosen) {
    return (
      <div className="page narrow">
        <h1>
          {chosen.entry.broker} — {chosen.entry.accountType}
        </h1>
        <Notice kind="warn">{i.t('cat.help')}</Notice>
        <MtPreview
          exp={chosen.exp}
          onDone={() => go('instruments')}
          onImported={() => updateSettings({ brokerCatalog: { entryId: chosen.entry.id, exportedAt: chosen.entry.exportedAt, lastCheckedAt: new Date().toISOString() } })}
        />
      </div>
    );
  }

  const brokers = [...new Set(index?.entries.map((e) => e.broker) ?? [])];
  return (
    <div className="page narrow">
      <h1>{i.t('cat.title')}</h1>
      <p className="muted">{i.t('cat.help')}</p>
      {loading && <p aria-live="polite">{i.t('cat.loading')}</p>}
      {error && (
        <Notice kind="error">
          {error}{' '}
          <button className="btn small" onClick={() => void load()}>
            {i.t('cat.retry')}
          </button>
        </Notice>
      )}
      {index && index.entries.length === 0 && <EmptyState>{i.t('cat.empty')}</EmptyState>}
      {brokers.map((b) => (
        <Card key={b} title={b}>
          <ul className="list">
            {index!.entries
              .filter((e) => e.broker === b)
              .map((e) => {
                const mine = sub.entryId === e.id;
                const newer = mine && (!sub.exportedAt || Date.parse(e.exportedAt) > Date.parse(sub.exportedAt));
                return (
                  <li key={e.id} className="list-item" data-testid={`catalog-${e.id}`}>
                    <div className="grow">
                      <strong>{e.accountType || e.broker}</strong> {mine && <span className="badge ok">{i.t('cat.subscribed')}</span>}
                      <div className="small muted">
                        {i.t('cat.meta', { n: i.n(String(e.symbolCount)), date: e.exportedAt ? i.dateTime(e.exportedAt, { dateStyle: 'medium' }) : '—', currency: e.accountCurrency, leverage: e.leverage || '?' })}
                      </div>
                      <div className="small muted">
                        <Num>{e.server}</Num>
                      </div>
                      {isStale(e.exportedAt) && <div className="small warn-text">{i.t('cat.stale')}</div>}
                      {mine && <div className="small">{newer ? i.t('cat.updateAvailable') : i.t('cat.upToDate')}</div>}
                    </div>
                    <button className={`btn ${newer || !mine ? 'primary' : ''}`} disabled={loadingEntry !== null} onClick={() => void choose(e)}>
                      {mine ? i.t('cat.review') : i.t('cat.choose')}
                    </button>
                  </li>
                );
              })}
          </ul>
        </Card>
      ))}
      <p>
        <a href={href('instruments/import-mt')}>{i.t('cat.manual')}</a>
      </p>
    </div>
  );
}
