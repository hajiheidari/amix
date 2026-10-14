import { useMemo, useState } from 'react';
import { newId, nowIso, parseDecimal, type Account, type Cashflow, type Fill, type Trade } from '@tc/domain';
import { accountBalance, exportSummaryCsv, exportTradesCsv, summarizeTrade, validateTrade } from '@tc/journal';
import { isoToZonedInput, zonedInputToIso } from '@tc/sessions';
import { put } from '@tc/storage';
import { Card, Checkbox, EmptyState, Field, Money, Notice, Num, NumberInput, Segmented, Select, TextArea, TextInput, errorText, useI18n } from '@tc/ui';
import { useStore } from '../state/store';
import { go, href } from '../state/router';
import { deleteAccountCascade, deleteCashflow, deleteTrade, prepareTrade, saveAccount, saveCashflow, undoImport } from '../state/services';
import { saveTextFile, stamp } from '../state/download';
import { useAppUi } from '../components/AppContext';
import { InstrumentPicker, needsConversion, sortedProfiles, takeTradeDraft, unitLabel } from '../components/forms';
import { ImportWizard } from './Import';

export const EMOTIONS = ['calm', 'confident', 'fearful', 'greedy', 'impatient', 'frustrated'];
export const MISTAKES = ['noPlan', 'movedStop', 'oversized', 'earlyExit', 'chased', 'revenge'];

export function Journal({ route }: { route: string[] }) {
  if (route[0] === 'trade') return <TradeForm id={route[1] ?? 'new'} />;
  if (route[0] === 'accounts') return <Accounts />;
  if (route[0] === 'account') return <AccountForm id={route[1] ?? 'new'} />;
  if (route[0] === 'import') return <ImportWizard />;
  return <JournalHome />;
}

function useSelectedAccount(): [string, (id: string) => void] {
  const { settings, data } = useStore();
  const [id, setId] = useState(() => (settings.defaultAccountId && data.accounts.some((a) => a.id === settings.defaultAccountId) ? settings.defaultAccountId : ''));
  return [id, setId];
}

function JournalHome() {
  const i = useI18n();
  const ui = useAppUi();
  const { data, repo, reload, commit } = useStore();
  const [accountId, setAccountId] = useSelectedAccount();
  const [symbol, setSymbol] = useState('');
  const accounts = data.accounts;
  const acc = accounts.find((a) => a.id === accountId);
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const trades = useMemo(
    () =>
      data.trades
        .filter((t) => !accountId || t.accountId === accountId)
        .filter((t) => !symbol || t.profile.symbol.toUpperCase().includes(symbol.toUpperCase().trim()))
        .map((t) => ({ t, s: summarizeTrade(t, accById.get(t.accountId)?.baseCurrency) }))
        .sort((a, b) => (b.s.firstEntryAt ?? '').localeCompare(a.s.firstEntryAt ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.trades, accountId, symbol, accounts],
  );

  if (accounts.length === 0)
    return (
      <div className="page">
        <h1>{i.t('jr.title')}</h1>
        <EmptyState action={<a className="btn primary" href={href('journal/account/new')}>{i.t('jr.newAccount')}</a>}>{i.t('jr.noAccounts')}</EmptyState>
      </div>
    );

  const remove = async (t: Trade) => {
    if (!(await ui.confirm(i.t('jr.deleteTradeConfirm', { symbol: t.profile.symbol }), { danger: true, confirmLabel: i.t('common.delete') }))) return;
    const undo = await deleteTrade(repo, t.id);
    await reload();
    ui.toast({ text: i.t('common.deleted'), action: { label: i.t('common.undo'), run: () => void commit(undo) } }, 8000);
  };
  const exportCsv = async (summary: boolean) => {
    const list = trades.map((x) => x.t);
    const csv = summary ? exportSummaryCsv(list, accounts) : exportTradesCsv(list, accounts);
    await saveTextFile(`amix-trades${summary ? '-summary' : ''}-${stamp()}.csv`, 'text/csv', csv);
  };
  const bal = acc ? accountBalance(acc, data.trades, data.cashflows) : null;

  return (
    <div className="page">
      <div className="page-head">
        <h1>{i.t('jr.title')}</h1>
        <div className="row wrap">
          <a className="btn primary" href={href('journal/trade/new')}>
            {i.t('jr.newTrade')}
          </a>
          <a className="btn" href={href('journal/import')}>
            {i.t('jr.import')}
          </a>
          <button className="btn" onClick={() => void exportCsv(false)}>
            {i.t('jr.export')}
          </button>
          <button className="btn" onClick={() => void exportCsv(true)}>
            {i.t('jr.exportSummary')}
          </button>
          <a className="btn" href={href('journal/accounts')}>
            {i.t('jr.accounts')}
          </a>
        </div>
      </div>
      <div className="grid2">
        <Select label={i.t('common.account')} value={accountId} onChange={setAccountId} options={[{ value: '', label: i.t('jr.allAccounts') }, ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.baseCurrency})` }))]} />
        <TextInput label={i.t('jr.filterSymbol')} value={symbol} ltr onChange={setSymbol} />
      </div>
      {acc && bal && (
        <div className="stats">
          <div className="stat">
            <div className="stat-label">{i.t('dash.balance')}</div>
            <div className="stat-value">
              <Money value={bal.balance} currency={acc.baseCurrency} />
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">{i.t('an.netPnl')}</div>
            <div className="stat-value">
              <Money value={bal.realized} currency={acc.baseCurrency} sign />
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">{i.t('jr.cashflows')}</div>
            <div className="stat-value small">
              +<Money value={bal.deposits} /> / −<Money value={bal.withdrawals} />
            </div>
          </div>
        </div>
      )}
      <Card title={i.t('jr.trades')}>
        {trades.length === 0 ? (
          <EmptyState>{i.t('jr.noTrades')}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table" data-testid="trades-table">
              <thead>
                <tr>
                  <th>{i.t('common.date')}</th>
                  <th>{i.t('common.instrument')}</th>
                  <th>{i.t('common.direction')}</th>
                  <th>{i.t('common.status')}</th>
                  <th>{i.t('jr.avgEntry')}</th>
                  <th>{i.t('jr.netPnl')}</th>
                  <th>{i.t('jr.realizedR')}</th>
                  <th>
                    <span className="sr-only">{i.t('common.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {trades.map(({ t, s }) => (
                  <tr key={t.id}>
                    <td>
                      <Num>{s.firstEntryAt ? i.dateTime(s.firstEntryAt, { dateStyle: 'short', timeStyle: 'short' }) : '—'}</Num>
                    </td>
                    <td>
                      <a href={href(`journal/trade/${t.id}`)}>
                        <Num>{t.profile.symbol}</Num>
                      </a>
                      {!accountId && <div className="small muted">{accById.get(t.accountId)?.name}</div>}
                    </td>
                    <td>{i.t(`common.${t.direction}`)}</td>
                    <td>
                      <span className={`badge ${s.status}`}>{i.t(`jr.status.${s.status}`)}</span>
                      {s.status !== 'closed' && (
                        <div className="small muted">
                          {i.t('jr.openQty')}: <Num>{i.n(s.openQty)}</Num>
                        </div>
                      )}
                    </td>
                    <td>
                      <Num>{i.n(s.avgEntry)}</Num>
                    </td>
                    <td>
                      {s.net ? <Money value={s.net} currency={accById.get(t.accountId)?.baseCurrency} sign /> : <span className="muted">{i.t('jr.pnlUnavailable')}</span>}
                      <div className="small muted">{i.t(`jr.pnlSource.${s.pnlSource}`)}</div>
                    </td>
                    <td>
                      <Num>{s.realizedR ? i.n(s.realizedR, 2, { sign: true }) : '—'}</Num>
                    </td>
                    <td className="actions">
                      <a className="btn small" href={href(`journal/trade/${t.id}`)}>
                        {i.t('common.edit')}
                      </a>
                      <button className="btn small danger" onClick={() => void remove(t)}>
                        {i.t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {acc && <Cashflows account={acc} />}
      <ImportBatches />
    </div>
  );
}

function Cashflows({ account }: { account: Account }) {
  const i = useI18n();
  const ui = useAppUi();
  const { data, repo, reload, commit } = useStore();
  const [type, setType] = useState<Cashflow['type']>('deposit');
  const [amount, setAmount] = useState('');
  const [at, setAt] = useState(() => isoToZonedInput(nowIso(), i.zone));
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const flows = data.cashflows.filter((c) => c.accountId === account.id).sort((a, b) => b.at.localeCompare(a.at));
  const amt = parseDecimal(amount);
  const amtErr = !amount ? i.t('error.required') : !amt ? i.t('error.notANumber') : !amt.gt(0) ? i.t('error.mustBePositive') : null;
  const atIso = zonedInputToIso(at, i.zone);
  return (
    <Card title={i.t('jr.cashflows')}>
      <p className="muted small">{i.t('jr.cfNote')}</p>
      {flows.length === 0 ? (
        <p className="muted">{i.t('jr.noCashflows')}</p>
      ) : (
        <ul className="plain">
          {flows.map((c) => (
            <li key={c.id} className="row between">
              <span>
                <Num>{i.dateTime(c.at, { dateStyle: 'medium' })}</Num> · {i.t(`jr.cf.${c.type}`)} <Money value={c.amount} currency={account.baseCurrency} /> {c.note && <span className="muted">— {c.note}</span>}
              </span>
              <button
                className="btn small danger"
                onClick={async () => {
                  const undo = await deleteCashflow(repo, c.id);
                  await reload();
                  ui.toast({ text: i.t('common.deleted'), action: { label: i.t('common.undo'), run: () => void commit(undo) } });
                }}
              >
                {i.t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitted(true);
          if (amtErr || !atIso) return;
          const ts = nowIso();
          await saveCashflow(repo, { id: newId('cf'), accountId: account.id, type, amount: amt!.toFixed(), at: atIso, note: note.trim(), importBatchId: null, createdAt: ts, updatedAt: ts });
          await reload();
          setAmount('');
          setNote('');
          setSubmitted(false);
          ui.toast({ text: i.t('common.saved'), kind: 'ok' });
        }}
        noValidate
      >
        <h3>{i.t('jr.addCashflow')}</h3>
        <div className="grid2">
          <Segmented label={i.t('jr.cfType')} value={type} onChange={setType} options={[{ value: 'deposit', label: i.t('jr.cf.deposit') }, { value: 'withdrawal', label: i.t('jr.cf.withdrawal') }]} />
          <NumberInput label={`${i.t('jr.amount')} (${account.baseCurrency})`} value={amount} onChange={setAmount} error={submitted ? amtErr : null} />
          <Field label={i.t('common.date')} error={submitted && !atIso ? i.t('error.invalidDate') : null}>
            {(p) => <input {...p} className="input" type="datetime-local" dir="ltr" value={at} onChange={(e) => setAt(e.target.value)} />}
          </Field>
          <TextInput label={i.t('common.notes')} value={note} onChange={setNote} optional />
        </div>
        <button className="btn" type="submit">
          {i.t('common.add')}
        </button>
      </form>
    </Card>
  );
}

function ImportBatches() {
  const i = useI18n();
  const ui = useAppUi();
  const { data, repo, reload } = useStore();
  const batches = data.importBatches.filter((b) => !b.undone).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (batches.length === 0) return null;
  return (
    <Card title={i.t('jr.importBatches')}>
      <ul className="plain">
        {batches.map((b) => (
          <li key={b.id} className="row between">
            <span>{i.t('jr.batchInfo', { file: b.fileName, n: i.n(String(b.tradeIds.length)), date: i.dateTime(b.createdAt) })}</span>
            <button
              className="btn small danger"
              onClick={async () => {
                if (!(await ui.confirm(i.t('jr.undoImportConfirm', { n: i.n(String(b.tradeIds.length)) }), { danger: true }))) return;
                await undoImport(repo, b.id);
                await reload();
                ui.toast({ text: i.t('jr.importUndone'), kind: 'ok' });
              }}
            >
              {i.t('jr.undoImport')}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Trade form                                                           */
/* ------------------------------------------------------------------ */

interface FillRow {
  id: string;
  side: Fill['side'];
  quantity: string;
  price: string;
  at: string; // datetime-local in user zone
}

function TradeForm({ id }: { id: string }) {
  const i = useI18n();
  const ui = useAppUi();
  const { data, settings, repo, reload, commit } = useStore();
  const existing = data.trades.find((t) => t.id === id);
  const draft = useMemo(() => (existing ? null : takeTradeDraft()), [existing]);
  const accounts = data.accounts.filter((a) => !a.archived || a.id === existing?.accountId);
  const nowLocal = isoToZonedInput(nowIso(), i.zone);

  const [accountId, setAccountId] = useState(existing?.accountId ?? (draft?.accountId || settings.defaultAccountId || accounts[0]?.id || ''));
  const [profileId, setProfileId] = useState(existing?.profile.id ?? draft?.profileId ?? settings.favoriteProfileIds[0] ?? sortedProfiles(data.profiles, [])[0]?.id ?? '');
  const [direction, setDirection] = useState<Trade['direction']>(existing?.direction ?? (draft?.direction as Trade['direction']) ?? 'long');
  const [fills, setFills] = useState<FillRow[]>(() =>
    existing ? existing.fills.map((f) => ({ ...f, at: isoToZonedInput(f.at, i.zone) })) : [{ id: newId('f'), side: 'entry', quantity: draft?.quantity ?? '', price: draft?.entry ?? '', at: nowLocal }],
  );
  const [stop, setStop] = useState(existing?.initialStop ?? draft?.stop ?? '');
  const [target, setTarget] = useState(existing?.initialTarget ?? '');
  const [risk, setRisk] = useState(existing?.initialRisk ?? draft?.initialRisk ?? '');
  const [rate, setRate] = useState(existing?.conversion && existing.conversion.source !== 'identity' ? existing.conversion.rate : draft?.conversionSource && draft.conversionSource !== 'identity' ? draft.conversionRate! : '');
  const [rateAt, setRateAt] = useState(existing?.conversion ? isoToZonedInput(existing.conversion.asOf, i.zone) : nowLocal);
  const [commission, setCommission] = useState(existing?.costs.commission ?? '0');
  const [swap, setSwap] = useState(existing?.costs.swap ?? '0');
  const [other, setOther] = useState(existing?.costs.other ?? '0');
  const [pnlMode, setPnlMode] = useState<Trade['pnlMode']>(existing?.pnlMode ?? 'computed');
  const [manualNet, setManualNet] = useState(existing?.manualNetPnl ?? '');
  const [strategy, setStrategy] = useState(existing?.strategy ?? '');
  const [setup, setSetup] = useState(existing?.setup ?? '');
  const [tags, setTags] = useState(existing?.tags.join(', ') ?? '');
  const [emotions, setEmotions] = useState<string[]>(existing?.emotions ?? []);
  const [mistakes, setMistakes] = useState<string[]>(existing?.mistakes ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [submitted, setSubmitted] = useState(false);

  const account = data.accounts.find((a) => a.id === accountId);
  // New trades snapshot the current profile; existing trades keep their stored snapshot.
  const profile = existing && existing.profile.id === profileId ? existing.profile : data.profiles.find((p) => p.id === profileId);
  const needConv = needsConversion(profile, account?.baseCurrency ?? '');
  const unit = unitLabel(i, profile);

  const build = (): Trade | null => {
    if (!profile || !account) return null;
    const ts = nowIso();
    const asOf = zonedInputToIso(rateAt, i.zone) ?? ts;
    return {
      id: existing?.id ?? newId('t'),
      accountId: account.id,
      profile: { ...profile },
      direction,
      fills: fills.map((f) => ({ id: f.id, side: f.side, quantity: f.quantity.trim(), price: f.price.trim(), at: zonedInputToIso(f.at, i.zone) ?? 'invalid' })).map((f) => ({ ...f, quantity: parseDecimal(f.quantity)?.toFixed() ?? f.quantity, price: parseDecimal(f.price)?.toFixed() ?? f.price })),
      initialStop: stop.trim() ? (parseDecimal(stop)?.toFixed() ?? stop) : null,
      initialTarget: target.trim() ? (parseDecimal(target)?.toFixed() ?? target) : null,
      initialRisk: risk.trim() ? (parseDecimal(risk)?.toFixed() ?? risk) : null,
      conversion: !needConv ? { from: profile.settlementCurrency, to: account.baseCurrency, rate: '1', source: 'identity', asOf } : parseDecimal(rate) ? { from: profile.settlementCurrency, to: account.baseCurrency, rate: parseDecimal(rate)!.toFixed(), source: 'manual', asOf } : null,
      costs: { commission: parseDecimal(commission || '0')?.toFixed() ?? commission, swap: parseDecimal(swap || '0')?.toFixed() ?? swap, other: parseDecimal(other || '0')?.toFixed() ?? other },
      pnlMode,
      manualNetPnl: pnlMode === 'manual_net' ? (parseDecimal(manualNet)?.toFixed() ?? (manualNet || null)) : null,
      strategy: strategy.trim(),
      setup: setup.trim(),
      tags: tags.split(/[,،]/).map((x) => x.trim()).filter(Boolean),
      emotions,
      mistakes,
      notes,
      importBatchId: existing?.importBatchId ?? null,
      fingerprint: existing?.fingerprint ?? '',
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
  };
  const trade = build();
  // Validate the raw input first; derived fields are computed only for valid trades.
  const v = trade ? validateTrade(trade, account) : null;
  const errs = v && !v.ok ? v.errors : [];
  const err = (f: string) => {
    if (!submitted) return null;
    const e = errs.find((x) => x.field === f);
    return e ? errorText(i, e) : null;
  };
  const summary = trade && v?.ok ? summarizeTrade(prepareTrade(trade), account?.baseCurrency) : null;
  const strategies = [...new Set(data.trades.map((t) => t.strategy).filter(Boolean))];

  const save = async () => {
    setSubmitted(true);
    if (!trade || !v?.ok) return;
    try {
      await commit([put('trades', prepareTrade(trade))]);
      ui.toast({ text: i.t('common.saved'), kind: 'ok' });
      go('journal');
    } catch (e) {
      ui.toast({ text: i.t('error.generic', { detail: String(e) }), kind: 'error' });
    }
  };
  const remove = async () => {
    if (!existing) return;
    if (!(await ui.confirm(i.t('jr.deleteTradeConfirm', { symbol: existing.profile.symbol }), { danger: true, confirmLabel: i.t('common.delete') }))) return;
    const undo = await deleteTrade(repo, existing.id);
    await reload();
    ui.toast({ text: i.t('common.deleted'), action: { label: i.t('common.undo'), run: () => void commit(undo) } }, 8000);
    go('journal');
  };
  const setFill = (k: number, patch: Partial<FillRow>) => setFills(fills.map((f, j) => (j === k ? { ...f, ...patch } : f)));
  const toggle = (list: string[], set: (v: string[]) => void, x: string) => set(list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  if (data.accounts.length === 0)
    return (
      <div className="page">
        <EmptyState action={<a className="btn primary" href={href('journal/account/new')}>{i.t('jr.newAccount')}</a>}>{i.t('jr.noAccounts')}</EmptyState>
      </div>
    );

  return (
    <div className="page narrow">
      <h1>{existing ? i.t('jr.editTrade') : i.t('jr.newTrade')}</h1>
      {submitted && errs.length > 0 && <Notice kind="error">{i.t('error.fixBelow')}</Notice>}
      <form onSubmit={(e) => (e.preventDefault(), void save())} noValidate>
        <Card>
          <div className="grid2">
            <Select label={i.t('common.account')} value={accountId} onChange={setAccountId} options={[{ value: '', label: i.t('jr.selectAccount') }, ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.baseCurrency})` }))]} error={err('accountId')} />
            {existing && existing.profile.id === profileId ? (
              <div className="field">
                <span className="label">{i.t('common.instrument')}</span>
                <p className="small">{i.t('jr.profileSnapshot', { symbol: existing.profile.symbol, v: existing.profile.version, broker: existing.profile.broker })}</p>
              </div>
            ) : (
              <InstrumentPicker value={profileId} onChange={setProfileId} />
            )}
          </div>
          <Segmented label={i.t('common.direction')} value={direction} onChange={setDirection} options={[{ value: 'long', label: i.t('common.long') }, { value: 'short', label: i.t('common.short') }]} />
        </Card>
        <Card title={i.t('jr.fills')}>
          {err('fills') && <Notice kind="error">{err('fills')}</Notice>}
          {fills.map((f, k) => (
            <div className="fill-row" key={f.id}>
              <Select label={`#${k + 1}`} value={f.side} onChange={(x) => setFill(k, { side: x })} options={[{ value: 'entry', label: i.t('jr.fill.entry') }, { value: 'exit', label: i.t('jr.fill.exit') }]} />
              <NumberInput label={`${i.t('common.quantity')} (${unit})`} value={f.quantity} onChange={(x) => setFill(k, { quantity: x })} error={err(`fills.${k}.quantity`)} name={`fill-qty-${k}`} />
              <NumberInput label={i.t('common.price')} value={f.price} onChange={(x) => setFill(k, { price: x })} error={err(`fills.${k}.price`)} name={`fill-price-${k}`} />
              <Field label={i.t('jr.fillTime', { zone: i.zone })} error={err(`fills.${k}.at`)}>
                {(p) => <input {...p} className="input" type="datetime-local" dir="ltr" value={f.at} onChange={(e) => setFill(k, { at: e.target.value })} />}
              </Field>
              <button type="button" className="icon-btn" aria-label={i.t('jr.removeFill', { n: k + 1 })} onClick={() => setFills(fills.filter((_, j) => j !== k))} disabled={fills.length === 1}>
                ×
              </button>
            </div>
          ))}
          <div className="row wrap">
            <button type="button" className="btn" onClick={() => setFills([...fills, { id: newId('f'), side: 'entry', quantity: '', price: '', at: nowLocal }])}>
              {i.t('jr.addEntry')}
            </button>
            <button type="button" className="btn" onClick={() => setFills([...fills, { id: newId('f'), side: 'exit', quantity: summary?.openQty.gt(0) ? summary.openQty.toFixed() : '', price: '', at: nowLocal }])}>
              {i.t('jr.addExit')}
            </button>
          </div>
        </Card>
        <Card>
          <div className="grid3">
            <NumberInput label={i.t('jr.initialStop')} value={stop} onChange={setStop} error={err('initialStop')} optional />
            <NumberInput label={i.t('jr.initialTarget')} value={target} onChange={setTarget} error={err('initialTarget')} optional />
            <NumberInput label={i.t('jr.initialRisk')} value={risk} onChange={setRisk} error={err('initialRisk')} optional help={i.t('jr.initialRiskHelp')} />
          </div>
          {needConv && profile && account && (
            <div className="grid2">
              <NumberInput label={i.t('jr.conversion', { from: profile.settlementCurrency, to: account.baseCurrency })} value={rate} onChange={setRate} error={err('conversion')} help={i.t('calc.conversionRate', { from: profile.settlementCurrency, to: account.baseCurrency })} />
              <Field label={i.t('calc.conversionAsOf')}>{(p) => <input {...p} className="input" type="datetime-local" dir="ltr" value={rateAt} onChange={(e) => setRateAt(e.target.value)} />}</Field>
            </div>
          )}
          <h3>{i.t('jr.costs')}</h3>
          <div className="grid3">
            <NumberInput label={i.t('jr.commission')} value={commission} onChange={setCommission} error={err('costs.commission')} />
            <NumberInput label={i.t('jr.swap')} value={swap} onChange={setSwap} error={err('costs.swap')} />
            <NumberInput label={i.t('jr.otherCosts')} value={other} onChange={setOther} error={err('costs.other')} />
          </div>
          <Segmented label={i.t('jr.pnlMode')} value={pnlMode} onChange={setPnlMode} options={[{ value: 'computed', label: i.t('jr.pnl.computed') }, { value: 'manual_net', label: i.t('jr.pnl.manual_net') }]} />
          {pnlMode === 'manual_net' && <NumberInput label={i.t('jr.manualNet')} value={manualNet} onChange={setManualNet} error={err('manualNetPnl')} help={i.t('jr.manualNetHelp')} />}
        </Card>
        <Card>
          <div className="grid2">
            <TextInput label={i.t('jr.strategy')} value={strategy} onChange={setStrategy} list="strategies" optional />
            <TextInput label={i.t('jr.setup')} value={setup} onChange={setSetup} optional />
          </div>
          <datalist id="strategies">
            {strategies.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <TextInput label={i.t('jr.tags')} value={tags} onChange={setTags} optional />
          <fieldset className="chips">
            <legend>{i.t('jr.emotions')}</legend>
            {EMOTIONS.map((x) => (
              <Checkbox key={x} label={i.t(`jr.emotion.${x}`)} checked={emotions.includes(x)} onChange={() => toggle(emotions, setEmotions, x)} />
            ))}
          </fieldset>
          <fieldset className="chips">
            <legend>{i.t('jr.mistakes')}</legend>
            {MISTAKES.map((x) => (
              <Checkbox key={x} label={i.t(`jr.mistake.${x}`)} checked={mistakes.includes(x)} onChange={() => toggle(mistakes, setMistakes, x)} />
            ))}
          </fieldset>
          <TextArea label={i.t('common.notes')} value={notes} onChange={setNotes} optional />
        </Card>
        {summary && (
          <Card title={i.t('common.details')} className="result">
            <div className="stats">
              <div className="stat">
                <div className="stat-label">{i.t('common.status')}</div>
                <div className="stat-value small">{i.t(`jr.status.${summary.status}`)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">{i.t('jr.avgEntry')}</div>
                <div className="stat-value small">
                  <Num>{i.n(summary.avgEntry)}</Num>
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">{i.t('jr.netPnl')}</div>
                <div className="stat-value small" data-testid="trade-net">
                  {summary.net ? <Money value={summary.net} currency={account?.baseCurrency} sign /> : i.t('jr.pnlUnavailable')}
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">{i.t('jr.plannedR')}</div>
                <div className="stat-value small">
                  <Num>{summary.plannedR ? i.n(summary.plannedR, 2) : '—'}</Num>
                </div>
              </div>
            </div>
          </Card>
        )}
        <div className="row wrap sticky-actions">
          <button className="btn primary" type="submit">
            {i.t('common.save')}
          </button>
          <a className="btn" href={href('journal')}>
            {i.t('common.cancel')}
          </a>
          {existing && (
            <button type="button" className="btn danger" onClick={() => void remove()}>
              {i.t('common.delete')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Accounts                                                             */
/* ------------------------------------------------------------------ */

function Accounts() {
  const i = useI18n();
  const { data, settings, updateSettings } = useStore();
  return (
    <div className="page">
      <div className="page-head">
        <h1>{i.t('jr.accounts')}</h1>
        <a className="btn primary" href={href('journal/account/new')}>
          {i.t('jr.newAccount')}
        </a>
      </div>
      <p className="notice warn">{i.t('disclaimer.local')}</p>
      {data.accounts.length === 0 && <EmptyState>{i.t('jr.noAccounts')}</EmptyState>}
      <ul className="list">
        {data.accounts.map((a) => {
          const b = accountBalance(a, data.trades, data.cashflows);
          return (
            <li key={a.id} className="list-item">
              <a href={href(`journal/account/${a.id}`)} className="grow">
                <strong>{a.name}</strong> <span className="muted">{a.broker}</span>
                {a.archived && <span className="badge muted">{i.t('jr.archived')}</span>}
                <div className="small">
                  {i.t('dash.balance')}: <Money value={b.balance} currency={a.baseCurrency} />
                </div>
              </a>
              <label className="check inline">
                <input type="radio" name="default-account" checked={settings.defaultAccountId === a.id} onChange={() => void updateSettings({ defaultAccountId: a.id })} />
                <span>{i.t('dash.defaultAccount')}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AccountForm({ id }: { id: string }) {
  const i = useI18n();
  const ui = useAppUi();
  const { data, repo, reload, settings, updateSettings } = useStore();
  const existing = data.accounts.find((a) => a.id === id);
  const [a, setA] = useState<Account>(
    () => existing ?? { id: newId('acc'), name: '', baseCurrency: 'USD', openingKind: 'balance', openingAmount: '', openingDate: nowIso(), broker: '', notes: '', archived: false, createdAt: nowIso(), updatedAt: nowIso() },
  );
  const [openLocal, setOpenLocal] = useState(isoToZonedInput(a.openingDate, i.zone));
  const [submitted, setSubmitted] = useState(false);
  const amount = parseDecimal(a.openingAmount);
  const errs = {
    name: !a.name.trim() ? i.t('error.required') : null,
    baseCurrency: !/^[A-Z][A-Z0-9]{1,9}$/.test(a.baseCurrency) ? i.t('error.currencyCode') : null,
    openingAmount: !a.openingAmount ? i.t('error.required') : !amount ? i.t('error.notANumber') : amount.lt(0) ? i.t('error.mustBeNonNegative') : null,
    openingDate: !zonedInputToIso(openLocal, i.zone) ? i.t('error.invalidDate') : null,
  };
  const ok = Object.values(errs).every((x) => !x);
  const tradeCount = data.trades.filter((t) => t.accountId === a.id).length;
  const currencyLocked = !!existing && tradeCount > 0;
  return (
    <div className="page narrow">
      <h1>{existing ? i.t('jr.editAccount') : i.t('jr.newAccount')}</h1>
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitted(true);
            if (!ok) return;
            await saveAccount(repo, { ...a, name: a.name.trim(), openingAmount: amount!.toFixed(), openingDate: zonedInputToIso(openLocal, i.zone)! });
            if (!settings.defaultAccountId) await updateSettings({ defaultAccountId: a.id });
            await reload();
            ui.toast({ text: i.t('common.saved'), kind: 'ok' });
            go('journal');
          }}
          noValidate
        >
          <TextInput label={i.t('jr.accountName')} value={a.name} onChange={(v) => setA({ ...a, name: v })} error={submitted ? errs.name : null} name="account-name" />
          <div className="grid2">
            <TextInput label={i.t('jr.baseCurrency')} value={a.baseCurrency} ltr onChange={(v) => !currencyLocked && setA({ ...a, baseCurrency: v.toUpperCase().trim() })} error={submitted ? errs.baseCurrency : null} />
            <TextInput label={i.t('jr.broker')} value={a.broker} onChange={(v) => setA({ ...a, broker: v })} optional />
          </div>
          <Segmented label={i.t('jr.openingKind')} value={a.openingKind} onChange={(v) => setA({ ...a, openingKind: v })} options={[{ value: 'balance', label: i.t('calc.basis.balance') }, { value: 'equity', label: i.t('calc.basis.equity') }]} />
          <div className="grid2">
            <NumberInput label={i.t('jr.openingAmount')} value={a.openingAmount} onChange={(v) => setA({ ...a, openingAmount: v })} error={submitted ? errs.openingAmount : null} name="opening-amount" />
            <Field label={i.t('jr.openingDate')} error={submitted ? errs.openingDate : null}>
              {(p) => <input {...p} className="input" type="datetime-local" dir="ltr" value={openLocal} onChange={(e) => setOpenLocal(e.target.value)} />}
            </Field>
          </div>
          <TextArea label={i.t('common.notes')} value={a.notes} onChange={(v) => setA({ ...a, notes: v })} optional />
          {existing && <Checkbox label={i.t('jr.archived')} checked={a.archived} onChange={(v) => setA({ ...a, archived: v })} />}
          <div className="row wrap">
            <button className="btn primary" type="submit">
              {i.t('common.save')}
            </button>
            <a className="btn" href={href('journal/accounts')}>
              {i.t('common.cancel')}
            </a>
            {existing && (
              <button
                type="button"
                className="btn danger"
                onClick={async () => {
                  if (!(await ui.confirm(i.t('jr.deleteAccountConfirm', { name: a.name, n: tradeCount }), { danger: true, confirmLabel: i.t('common.delete') }))) return;
                  await deleteAccountCascade(repo, a.id, settings);
                  await reload();
                  ui.toast({ text: i.t('common.deleted') });
                  go('journal/accounts');
                }}
              >
                {i.t('common.delete')}
              </button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}


