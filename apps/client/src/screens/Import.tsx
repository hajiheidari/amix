import { useMemo, useState } from 'react';
import { newId, nowIso } from '@tc/domain';
import { CANONICAL_COLUMNS, IMPORT_FIELDS, guessMapping, parseCsv, previewImport, toCsv, type ColumnMapping, type DateFormat, type ParsedCsv, type RowShape } from '@tc/journal';
import { COMMON_ZONES, isValidZone } from '@tc/sessions';
import { Card, Checkbox, Field, Notice, Num, Select, TextInput, errorText, useI18n } from '@tc/ui';
import { useStore } from '../state/store';
import { go, href } from '../state/router';
import { commitImport } from '../state/services';
import { readTextFile, saveTextFile } from '../state/download';
import { useAppUi } from '../components/AppContext';

export function ImportWizard() {
  const i = useI18n();
  const ui = useAppUi();
  const { data, settings, repo, reload } = useStore();
  const [accountId, setAccountId] = useState(settings.defaultAccountId ?? data.accounts[0]?.id ?? '');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [shape, setShape] = useState<RowShape>('fills');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [zone, setZone] = useState('UTC');
  const [dateFormat, setDateFormat] = useState<DateFormat>('iso');
  const [includeDup, setIncludeDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const account = data.accounts.find((a) => a.id === accountId);
  const batchId = useMemo(() => newId('b'), []);

  const preview = useMemo(() => {
    if (!parsed || !account || !isValidZone(zone)) return null;
    return previewImport(parsed, { shape, mapping, account, profiles: data.profiles, existingTrades: data.trades, zone, dateFormat, importBatchId: batchId });
  }, [parsed, account, shape, mapping, zone, dateFormat, data.profiles, data.trades, batchId]);

  const onFile = async (f: File | undefined) => {
    setParsed(null);
    setParseErr(null);
    if (!f) return;
    setFileName(f.name);
    try {
      const { text, bytes } = await readTextFile(f);
      const r = parseCsv(text, bytes);
      if (!r.ok) return setParseErr(i.t(r.code, r.params));
      setParsed(r.value);
      const canonical = CANONICAL_COLUMNS.every((c) => r.value.headers.includes(c));
      const sh: RowShape = canonical || r.value.headers.includes('fill_side') ? 'fills' : 'round_trip';
      setShape(sh);
      setMapping(guessMapping(r.value.headers, sh));
      if (canonical) setDateFormat('iso');
    } catch (e) {
      setParseErr(i.t('error.generic', { detail: String(e) }));
    }
  };

  const commit = async () => {
    if (!preview) return;
    const trades = [...preview.valid, ...(includeDup ? preview.duplicates.map((d) => d.trade) : [])];
    if (trades.length === 0) return;
    setBusy(true);
    try {
      await commitImport(repo, { id: batchId, kind: 'trades_csv', fileName, createdAt: nowIso() }, trades);
      await reload();
      ui.toast({ text: i.t('imp.done', { n: i.n(String(trades.length)) }), kind: 'ok' }, 8000);
      go('journal');
    } catch (e) {
      // The repository transaction rolled back: nothing was written.
      ui.toast({ text: i.t('error.generic', { detail: e instanceof Error ? e.message : String(e) }), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const template = () => saveTextFile('amix-trades-template.csv', 'text/csv', toCsv([...CANONICAL_COLUMNS], [['T-1', '', 'USD', 'EURUSD', 'long', 'entry', '0.10', '1.1000', '2026-01-05T14:00:00Z', '1.0950', '1.1100', '', '', '0.7', '0', '0', 'computed', '', 'Breakout', '', 'example', '', '', 'Example row'], ['T-1', '', 'USD', 'EURUSD', 'long', 'exit', '0.10', '1.1050', '2026-01-05T16:00:00Z', '1.0950', '1.1100', '', '', '0.7', '0', '0', 'computed', '', 'Breakout', '', 'example', '', '', 'Example row']]));
  const count = preview ? preview.valid.length + (includeDup ? preview.duplicates.length : 0) : 0;

  return (
    <div className="page narrow">
      <h1>{i.t('imp.title')}</h1>
      <p className="muted">{i.t('imp.help')}</p>
      <button className="btn small" onClick={() => void template()}>
        {i.t('imp.templateDownload')}
      </button>
      <Card>
        <Select label={i.t('imp.targetAccount')} value={accountId} onChange={setAccountId} options={data.accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.baseCurrency})` }))} />
        <Field label={i.t('imp.file')} error={parseErr}>
          {(p) => <input {...p} className="input" type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="csv-file" />}
        </Field>
      </Card>
      {parsed && (
        <Card title={i.t('imp.mapping')}>
          <Select
            label={i.t('imp.shape')}
            value={shape}
            onChange={(s) => {
              setShape(s);
              setMapping(guessMapping(parsed.headers, s));
            }}
            options={[
              { value: 'fills', label: i.t('imp.shape.fills') },
              { value: 'round_trip', label: i.t('imp.shape.round_trip') },
            ]}
          />
          <div className="grid2">
            <TextInput label={i.t('imp.timezone')} value={zone} ltr list="tz-list" onChange={(v) => setZone(v.trim())} error={isValidZone(zone) ? null : i.t('error.invalidZone')} />
            <Select<DateFormat> label={i.t('imp.dateFormat')} value={dateFormat} onChange={setDateFormat} options={(['iso', 'ymd_dots', 'dmy', 'mdy'] as const).map((d) => ({ value: d, label: i.t(`imp.df.${d}`) }))} />
          </div>
          <datalist id="tz-list">
            {COMMON_ZONES.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          <div className="grid3">
            {IMPORT_FIELDS[shape].map(({ field, required }) => (
              <Select
                key={field}
                label={
                  <>
                    <Num>{field}</Num>
                    {required ? ' *' : ''}
                  </>
                }
                value={mapping[field] === null || mapping[field] === undefined ? '' : String(mapping[field])}
                onChange={(v) => setMapping({ ...mapping, [field]: v === '' ? null : Number(v) })}
                options={[{ value: '', label: i.t('imp.notMapped') }, ...parsed.headers.map((h, k) => ({ value: String(k), label: h || `#${k + 1}` }))]}
              />
            ))}
          </div>
        </Card>
      )}
      {preview && (
        <Card title={i.t('imp.preview')}>
          <p data-testid="import-summary">{i.t('imp.summary', { valid: i.n(String(preview.valid.length)), dup: i.n(String(preview.duplicates.length)), invalid: i.n(String(preview.invalid.length)), total: i.n(String(preview.totalRows)) })}</p>
          {preview.invalid.length > 0 && (
            <ul className="errors-list">
              {preview.invalid.slice(0, 50).map((r, k) => (
                <li key={k}>
                  <strong>{r.row === 0 ? i.t('imp.header') : i.t('imp.row', { row: i.n(String(r.row)) })}:</strong> {r.errors.map((e) => `${e.field}: ${errorText(i, e)}`).join(' · ')}
                </li>
              ))}
            </ul>
          )}
          {preview.valid.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{i.t('common.instrument')}</th>
                    <th>{i.t('common.direction')}</th>
                    <th>{i.t('jr.fills')}</th>
                    <th>{i.t('common.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.valid.slice(0, 20).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Num>{t.profile.symbol}</Num>
                      </td>
                      <td>{i.t(`common.${t.direction}`)}</td>
                      <td>
                        <Num>{i.n(String(t.fills.length))}</Num>
                      </td>
                      <td>
                        <Num>{i.dateTime(t.fills[0]!.at)}</Num>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.duplicates.length > 0 && <Checkbox label={i.t('imp.includeDuplicates')} checked={includeDup} onChange={setIncludeDup} />}
          <div className="row wrap">
            <button className="btn primary" disabled={count === 0 || busy} onClick={() => void commit()}>
              {i.t('imp.commit', { n: i.n(String(count)) })}
            </button>
            <a className="btn" href={href('journal')}>
              {i.t('common.cancel')}
            </a>
          </div>
        </Card>
      )}
      {!account && <Notice kind="warn">{i.t('jr.noAccounts')}</Notice>}
    </div>
  );
}
