import { useMemo, useState } from 'react';
import { mapExport, parseMtExport, type MtExport } from '@tc/data-contracts';
import { put } from '@tc/storage';
import { Card, Checkbox, Field, Notice, Num, TextInput, useI18n } from '@tc/ui';
import { useStore } from '../state/store';
import { go, href } from '../state/router';
import { readTextFile, saveTextFile } from '../state/download';
import { useAppUi } from '../components/AppContext';

/** Import broker contract specs exported by the AmixExport MQL4/MQL5 script. */
export function ImportMt() {
  const i = useI18n();
  const ui = useAppUi();
  const { data, commit } = useStore();
  const [exp, setExp] = useState<MtExport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const mapped = useMemo(() => (exp ? mapExport(exp, data.profiles) : []), [exp, data.profiles]);
  const visible = mapped.filter((m) => !filter || m.symbol.toUpperCase().includes(filter.trim().toUpperCase()) || m.description.toUpperCase().includes(filter.trim().toUpperCase()));
  const counts = {
    ok: mapped.filter((m) => m.profile && m.warnings.length === 0).length,
    warn: mapped.filter((m) => m.profile && m.warnings.length > 0).length,
    bad: mapped.filter((m) => !m.profile).length,
  };

  const onFile = async (f: File | undefined) => {
    setExp(null);
    setError(null);
    if (!f) return;
    const { text, bytes } = await readTextFile(f);
    const r = parseMtExport(text, bytes);
    if (!r.ok) return setError(i.t(r.code, { detail: r.detail ?? '' }));
    setExp(r.value);
    // Preselect importable, tradeable symbols.
    setSelected(new Set(mapExport(r.value, data.profiles).filter((m) => m.profile && !m.warnings.includes('mt.warn.tradeDisabled')).map((m) => m.symbol)));
  };

  const doImport = async () => {
    const chosen = mapped.filter((m) => m.profile && selected.has(m.symbol));
    if (!chosen.length) return;
    setBusy(true);
    try {
      // One transaction; existing profiles (same symbol + broker) get the next version.
      await commit(chosen.map((m) => put('profiles', { ...m.profile!, version: m.profile!.version + 1 })));
      ui.toast({ text: i.t('mt.done', { n: i.n(String(chosen.length)) }), kind: 'ok' });
      go('instruments');
    } catch (e) {
      ui.toast({ text: i.t('error.generic', { detail: e instanceof Error ? e.message : String(e) }), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const download = async (file: string) => {
    const text = await (await fetch(`./tools/${file}`)).text();
    await saveTextFile(file, 'text/plain', text);
  };

  const toggle = (sym: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(sym);
    else next.delete(sym);
    setSelected(next);
  };

  return (
    <div className="page narrow">
      <h1>{i.t('mt.title')}</h1>
      <p className="muted">{i.t('mt.help')}</p>
      <Card>
        <ol className="steps">
          <li>
            {i.t('mt.step1')}
            <div className="row wrap">
              <button className="btn small" onClick={() => void download('AmixExport.mq5')}>
                {i.t('mt.downloadMq5')}
              </button>
              <button className="btn small" onClick={() => void download('AmixExport.mq4')}>
                {i.t('mt.downloadMq4')}
              </button>
            </div>
          </li>
          <li>{i.t('mt.step2')}</li>
          <li>{i.t('mt.step3')}</li>
          <li>{i.t('mt.step4')}</li>
        </ol>
        <Notice kind="info">{i.t('mt.scriptNote')}</Notice>
        <Field label={i.t('mt.file')} error={error}>
          {(p) => <input {...p} className="input" type="file" accept=".json,application/json" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="mt-file" />}
        </Field>
      </Card>
      {exp && (
        <Card title={i.t('imp.preview')}>
          <p className="small wrap-anywhere">
            {i.t('mt.source', { platform: exp.platform, broker: [exp.account.company, exp.account.server].filter(Boolean).join(' · '), date: exp.exportedAt ? i.dateTime(exp.exportedAt, { dateStyle: 'medium' }) : '—', currency: exp.account.currency, leverage: exp.account.leverage || '?' })}
          </p>
          <p data-testid="mt-summary">{i.t('mt.summary', { ok: i.n(String(counts.ok)), warn: i.n(String(counts.warn)), bad: i.n(String(counts.bad)), total: i.n(String(mapped.length)) })}</p>
          <p className="muted small">{i.t('mt.updates')}</p>
          <div className="grid2">
            <TextInput label={i.t('mt.filter')} value={filter} ltr onChange={setFilter} />
            <div className="row wrap field end">
              <button className="btn small" onClick={() => setSelected(new Set([...selected, ...visible.filter((m) => m.profile).map((m) => m.symbol)]))}>
                {i.t('mt.selectAll')}
              </button>
              <button className="btn small" onClick={() => setSelected(new Set([...selected].filter((s) => !visible.some((m) => m.symbol === s))))}>
                {i.t('mt.selectNone')}
              </button>
            </div>
          </div>
          <ul className="list mt-list">
            {visible.map((m) => (
              <li key={m.symbol} className="list-item">
                {m.profile ? <Checkbox label={<span className="sr-only">{i.t('mt.selectSymbol', { symbol: m.symbol })}</span>} checked={selected.has(m.symbol)} onChange={(on) => toggle(m.symbol, on)} /> : <span className="badge muted">{i.t('mt.notImportable')}</span>}
                <div className="grow">
                  <strong>
                    <Num>{m.symbol}</Num>
                  </strong>{' '}
                  <span className="muted small">{m.description}</span>
                  {m.profile && (
                    <div className="small muted">
                      {i.t(`inst.ac.${m.profile.assetClass}`)} · {i.t('inst.multiplier')}: <Num>{i.n(m.profile.contractMultiplier)}</Num> · {i.t('inst.tickSize')}: <Num>{i.n(m.profile.tickSize)}</Num> · <Num>{`${i.n(m.profile.minQuantity)}–${m.profile.maxQuantity ? i.n(m.profile.maxQuantity) : '∞'} / ${i.n(m.profile.quantityStep)}`}</Num> · {i.t(`margin.${m.profile.margin.kind}`)}
                      {m.profile.version > 0 && <> · {i.t('inst.version', { v: m.profile.version + 1 })}</>}
                    </div>
                  )}
                  {m.error && <div className="small error">{i.t(m.error)}</div>}
                  {m.warnings.map((w) => (
                    <div key={w} className="small warn-text">
                      ⚠ {i.t(w)}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="row wrap">
            <button className="btn primary" disabled={busy || selected.size === 0} onClick={() => void doImport()} data-testid="mt-import">
              {i.t('mt.import', { n: i.n(String(mapped.filter((m) => m.profile && selected.has(m.symbol)).length)) })}
            </button>
            <a className="btn" href={href('instruments')}>
              {i.t('common.cancel')}
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}
