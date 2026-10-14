import { useState } from 'react';
import { calculateMargin, calculatePipTick, calculatePnl, calculatePositionSize, calculateRiskReward, summarizePortfolioRisk, targetForRatio } from '@tc/calculators';
import { type Dec } from '@tc/domain';
import { accountBalance } from '@tc/journal';
import { Card, Money, Notice, Num, NumberInput, Segmented, Stat, TextInput, useI18n } from '@tc/ui';
import { useStore } from '../state/store';
import { go, href } from '../state/router';
import { AccountInputs, ConversionInputs, InstrumentPicker, setTradeDraft, unitLabel, useErrors, useProfile, type AccountValue } from '../components/forms';

const TABS = ['position', 'margin', 'pipTick', 'pnl', 'rr', 'portfolio'] as const;
type Tab = (typeof TABS)[number];

function useDefaults() {
  const { settings, data } = useStore();
  const fav = settings.favoriteProfileIds[0] ?? data.profiles[0]?.id ?? '';
  return { fav };
}

function useAccountState(): [AccountValue, (v: AccountValue) => void] {
  const { settings, data } = useStore();
  const [v, setV] = useState<AccountValue>(() => {
    const a = data.accounts.find((x) => x.id === settings.defaultAccountId && !x.archived);
    if (!a) return { accountId: '', currency: 'USD', amount: '' };
    return { accountId: a.id, currency: a.baseCurrency, amount: accountBalance(a, data.trades, data.cashflows).balance.toFixed() };
  });
  return [v, setV];
}

export function Calculators({ tab }: { tab?: string }) {
  const i = useI18n();
  const active: Tab = (TABS as readonly string[]).includes(tab ?? '') ? (tab as Tab) : 'position';
  const labels: Record<Tab, string> = { position: 'calc.position', margin: 'calc.margin', pipTick: 'calc.pipTick', pnl: 'calc.pnl', rr: 'calc.rr', portfolio: 'calc.portfolio' };
  return (
    <div className="page">
      <h1>{i.t('calc.title')}</h1>
      <nav className="tabs" aria-label={i.t('calc.title')}>
        {TABS.map((t) => (
          <a key={t} href={href(`calculators/${t}`)} className={`tabbtn ${t === active ? 'on' : ''}`} aria-current={t === active ? 'page' : undefined}>
            {i.t(labels[t])}
          </a>
        ))}
      </nav>
      {active === 'position' && <PositionSize />}
      {active === 'margin' && <Margin />}
      {active === 'pipTick' && <PipTick />}
      {active === 'pnl' && <Pnl />}
      {active === 'rr' && <RiskReward />}
      {active === 'portfolio' && <Portfolio />}
    </div>
  );
}

function Assumptions({ keys, extra }: { keys: string[]; extra?: string[] }) {
  const i = useI18n();
  return (
    <div className="assumptions">
      <h3>{i.t('calc.assumptions')}</h3>
      <ul>
        {keys.map((k) => (
          <li key={k}>{i.t(k)}</li>
        ))}
        {extra?.map((x) => <li key={x}>{x}</li>)}
      </ul>
    </div>
  );
}

function ConvLine({ conv, entry }: { conv: { source: string; rate: Dec; from: string; to: string } | null | undefined; entry?: string }) {
  const i = useI18n();
  if (!conv) return null;
  const text = conv.source === 'identity' ? i.t('calc.conv.identity') : conv.source === 'manual' ? i.t('calc.conv.manual', { rate: i.n(conv.rate) }) : i.t('calc.conv.instrument_price', { price: entry ?? '' });
  return (
    <p className="muted small">
      {i.t('calc.conversionUsed')}: <Num>{`${conv.from}→${conv.to}`}</Num> — {text}
    </p>
  );
}

function PositionSize() {
  const i = useI18n();
  const { settings } = useStore();
  const { fav } = useDefaults();
  const [acc, setAcc] = useAccountState();
  const [basis, setBasis] = useState<'balance' | 'equity'>('balance');
  const [riskMode, setRiskMode] = useState(settings.riskPreset.mode);
  const [riskValue, setRiskValue] = useState(settings.riskPreset.value);
  const [profileId, setProfileId] = useState(fav);
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState('');
  const [comm, setComm] = useState('');
  const [commFixed, setCommFixed] = useState('');
  const [slip, setSlip] = useState('');
  const [lev, setLev] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const profile = useProfile(profileId);

  const res = profile
    ? calculatePositionSize({ profile, accountCurrency: acc.currency, accountBasis: basis, accountAmount: acc.amount, riskMode, riskValue, direction, entry, stop, conversionRate: rate, commissionPerQuantity: comm, commissionFixed: commFixed, slippage: slip, leverageOverride: lev })
    : null;
  const values = { accountAmount: acc.amount, riskValue, entry, stop, conversionRate: rate, commissionPerQuantity: comm, commissionFixed: commFixed, slippage: slip };
  const err = useErrors(res && !res.ok ? res.errors : null, values, submitted);
  const unit = unitLabel(i, profile);
  const r = res?.ok ? res.value : null;

  return (
    <div className="calc-layout">
      <Card title={i.t('calc.position')}>
        <form onSubmit={(e) => (e.preventDefault(), setSubmitted(true))} noValidate>
          <AccountInputs value={acc} onChange={setAcc} err={err} />
          <Segmented label={i.t('calc.basis')} value={basis} onChange={setBasis} options={[{ value: 'balance', label: i.t('calc.basis.balance') }, { value: 'equity', label: i.t('calc.basis.equity') }]} />
          <div className="grid2">
            <Segmented label={i.t('calc.riskMode')} value={riskMode} onChange={setRiskMode} options={[{ value: 'percent', label: i.t('calc.riskMode.percent') }, { value: 'cash', label: i.t('calc.riskMode.cash') }]} />
            <NumberInput label={riskMode === 'percent' ? i.t('calc.riskPercent') : i.t('calc.riskCash')} value={riskValue} onChange={setRiskValue} error={err('riskValue')} />
          </div>
          <InstrumentPicker value={profileId} onChange={setProfileId} />
          <Segmented label={i.t('common.direction')} value={direction} onChange={setDirection} options={[{ value: 'long', label: i.t('common.long') }, { value: 'short', label: i.t('common.short') }]} />
          <div className="grid2">
            <NumberInput label={i.t('calc.entry')} value={entry} onChange={setEntry} error={err('entry')} name="entry" />
            <NumberInput label={i.t('calc.stop')} value={stop} onChange={setStop} error={err('stop')} name="stop" />
          </div>
          <ConversionInputs profile={profile} accountCurrency={acc.currency} rate={rate} asOf={asOf} onRate={setRate} onAsOf={setAsOf} err={err} />
          <details>
            <summary>{i.t('calc.costs')}</summary>
            <div className="grid2">
              <NumberInput label={i.t('calc.commissionPerQty', { unit })} value={comm} onChange={setComm} error={err('commissionPerQuantity')} optional />
              <NumberInput label={i.t('calc.commissionFixed')} value={commFixed} onChange={setCommFixed} error={err('commissionFixed')} optional />
              <NumberInput label={i.t('calc.slippage')} value={slip} onChange={setSlip} error={err('slippage')} optional />
              {profile?.margin.kind === 'leverage' && <NumberInput label={i.t('calc.leverageOverride')} value={lev} onChange={setLev} optional />}
            </div>
          </details>
          <button className="btn primary" type="submit">
            {i.t('common.calculate')}
          </button>
        </form>
      </Card>
      <Card title={i.t('calc.result')} className="result" id="position-result">
        {!profile && <p className="muted">{i.t('calc.selectInstrument')}</p>}
        {res && !res.ok && submitted && <Notice kind="error">{i.t('error.fixBelow')}</Notice>}
        {r && (
          <div aria-live="polite">
            {r.status === 'below_minimum' ? (
              <Notice kind="warn">{i.t('calc.noValidPosition', { min: i.n(profile!.minQuantity), unit })}</Notice>
            ) : (
              <div className="big-result" data-testid="position-qty">
                <Num>{i.n(r.quantity)}</Num> <span>{unit}</span>
              </div>
            )}
            {r.status === 'capped_at_maximum' && <Notice kind="warn">{i.t('calc.cappedAtMax', { max: i.n(profile!.maxQuantity), unit })}</Notice>}
            <div className="stats">
              <Stat label={i.t('calc.riskBudget')} value={<Money value={r.riskBudget} currency={acc.currency} />} />
              <Stat label={i.t('calc.modeledRisk')} value={r.modeledRisk ? <Money value={r.modeledRisk} currency={acc.currency} /> : '—'} sub={r.modeledRiskPercent ? <Num>{i.n(r.modeledRiskPercent, 3)}%</Num> : undefined} />
              <Stat label={i.t('calc.stopDistance')} value={<Num>{i.n(r.stopDistance)}</Num>} sub={<><Num>{i.n(r.stopTicks, 2)}</Num> {i.t('calc.stopTicks')}{r.stopPips ? <> · <Num>{i.n(r.stopPips, 2)}</Num> {i.t('calc.stopPips')}</> : null}</>} />
              <Stat label={i.t('calc.lossPerUnit', { unit })} value={<Money value={r.lossPerQuantity} currency={acc.currency} />} />
              <Stat label={i.t('calc.rawQuantity')} value={<Num>{i.n(r.rawQuantity, 6)}</Num>} />
              {r.margin?.status === 'estimated' && <Stat label={i.t('calc.marginEstimate')} value={<Money value={r.margin.amount} currency={acc.currency} />} sub={r.notional ? <>{i.t('calc.notional')}: <Money value={r.notional} currency={acc.currency} /></> : undefined} />}
            </div>
            {r.margin?.status === 'unsupported' && <Notice kind="info">{i.t('calc.marginUnsupported')}</Notice>}
            {!r.stopOnTick && <Notice kind="warn">{i.t('calc.stopOffTick')}</Notice>}
            <ConvLine conv={r.conversion} entry={entry} />
            {asOf && r.conversion.source === 'manual' && (
              <p className="muted small">
                {i.t('calc.conversionAsOf')}: <Num>{i.dateTime(asOf)}</Num>
              </p>
            )}
            <Assumptions keys={r.assumptions} />
            {r.quantity && (
              <button
                className="btn"
                onClick={() => {
                  setTradeDraft({ profileId, direction, quantity: r.quantity!.toFixed(), entry, stop, accountId: acc.accountId, conversionRate: r.conversion.rate.toFixed(), conversionSource: r.conversion.source, initialRisk: r.modeledRisk?.toDecimalPlaces(2).toFixed() ?? '' });
                  go('journal/trade/new');
                }}
              >
                {i.t('calc.recordTrade')}
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Margin() {
  const i = useI18n();
  const { fav } = useDefaults();
  const [acc, setAcc] = useAccountState();
  const [profileId, setProfileId] = useState(fav);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState('');
  const [lev, setLev] = useState('');
  const [free, setFree] = useState('');
  const profile = useProfile(profileId);
  const res = profile ? calculateMargin({ profile, quantity: qty, price, accountCurrency: acc.currency, conversionRate: rate, leverageOverride: lev, freeMargin: free }) : null;
  const err = useErrors(res && !res.ok ? res.errors : null, { quantity: qty, price, conversionRate: rate, freeMargin: free }, false);
  const r = res?.ok ? res.value : null;
  return (
    <div className="calc-layout">
      <Card title={i.t('calc.margin')}>
        <AccountInputs value={acc} onChange={setAcc} err={err} showAmount={false} />
        <InstrumentPicker value={profileId} onChange={setProfileId} />
        <div className="grid2">
          <NumberInput label={`${i.t('common.quantity')} (${unitLabel(i, profile)})`} value={qty} onChange={setQty} error={err('quantity')} />
          <NumberInput label={i.t('common.price')} value={price} onChange={setPrice} error={err('price')} />
          {profile?.margin.kind === 'leverage' && <NumberInput label={i.t('calc.leverageOverride')} value={lev} onChange={setLev} optional help={`${i.t('calc.leverage')}: ${i.n(profile.margin.leverage)}`} />}
          <NumberInput label={i.t('calc.freeMargin')} value={free} onChange={setFree} error={err('freeMargin')} optional />
        </div>
        <ConversionInputs profile={profile} accountCurrency={acc.currency} rate={rate} asOf={asOf} onRate={setRate} onAsOf={setAsOf} err={err} />
      </Card>
      <Card title={i.t('calc.result')} className="result">
        {r?.status === 'unsupported' && <Notice kind="info">{i.t('calc.marginUnsupported')}</Notice>}
        {r?.status === 'estimated' && (
          <div aria-live="polite">
            <div className="big-result">
              <Money value={r.margin} currency={r.currency} />
            </div>
            <div className="stats">
              <Stat label={i.t('calc.marginModel')} value={i.t(`margin.${r.model}`)} />
              {r.notional && <Stat label={i.t('calc.notional')} value={<Money value={r.notional} currency={r.currency} />} />}
              {r.freeMarginAfter && <Stat label={i.t('calc.marginFree')} value={<Money value={r.freeMarginAfter} currency={r.currency} sign />} tone={r.sufficient ? undefined : 'neg'} />}
            </div>
            {r.sufficient !== null && <Notice kind={r.sufficient ? 'ok' : 'warn'}>{i.t(r.sufficient ? 'calc.marginSufficient' : 'calc.marginInsufficient')}</Notice>}
            <ConvLine conv={r.conversion} entry={price} />
          </div>
        )}
        <Assumptions keys={[]} extra={[`${i.t('calc.marginModel')}: ${profile ? i.t(`margin.${profile.margin.kind}`) : '—'}`]} />
      </Card>
    </div>
  );
}

function PipTick() {
  const i = useI18n();
  const { fav } = useDefaults();
  const [acc, setAcc] = useAccountState();
  const [profileId, setProfileId] = useState(fav);
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState('');
  const profile = useProfile(profileId);
  const res = profile ? calculatePipTick({ profile, quantity: qty, accountCurrency: acc.currency, price, conversionRate: rate }) : null;
  const err = useErrors(res && !res.ok ? res.errors : null, { quantity: qty, conversionRate: rate }, false);
  const r = res?.ok ? res.value : null;
  const derivable = profile?.assetClass === 'fx' && profile.baseCurrency === acc.currency && profile.settlementCurrency !== acc.currency;
  return (
    <div className="calc-layout">
      <Card title={i.t('calc.pipTick')}>
        <AccountInputs value={acc} onChange={setAcc} err={err} showAmount={false} />
        <InstrumentPicker value={profileId} onChange={setProfileId} />
        <div className="grid2">
          <NumberInput label={`${i.t('common.quantity')} (${unitLabel(i, profile)})`} value={qty} onChange={setQty} error={err('quantity')} />
          {derivable && <NumberInput label={i.t('common.price')} value={price} onChange={setPrice} />}
        </div>
        <ConversionInputs profile={profile} accountCurrency={acc.currency} rate={rate} asOf={asOf} onRate={setRate} onAsOf={setAsOf} err={err} />
      </Card>
      <Card title={i.t('calc.result')} className="result">
        {res && !res.ok && <Notice kind="info">{res.errors.map((e) => i.t(e.code, e.params)).join(' ')}</Notice>}
        {r && (
          <div className="stats" aria-live="polite">
            <Stat label={i.t('calc.pipValue')} value={r.pipValueAccount ? <Money value={r.pipValueAccount} currency={acc.currency} dp={4} /> : i.t('common.na')} sub={r.pipValueAccount ? undefined : i.t('calc.noPip')} />
            <Stat label={i.t('calc.tickValue')} value={<Money value={r.tickValueAccount} currency={acc.currency} dp={4} />} sub={<>{i.t('inst.tickSize')}: <Num>{i.n(profile!.tickSize)}</Num></>} />
            <Stat label={i.t('calc.pointValue')} value={<Money value={r.pointValueAccount} currency={acc.currency} dp={4} />} />
          </div>
        )}
        {r && <ConvLine conv={r.conversion} entry={price} />}
      </Card>
    </div>
  );
}

function Pnl() {
  const i = useI18n();
  const { fav } = useDefaults();
  const [acc, setAcc] = useAccountState();
  const [profileId, setProfileId] = useState(fav);
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [qty, setQty] = useState('');
  const [entry, setEntry] = useState('');
  const [exit, setExit] = useState('');
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState('');
  const [comm, setComm] = useState('');
  const [commFixed, setCommFixed] = useState('');
  const [swap, setSwap] = useState('');
  const profile = useProfile(profileId);
  const res = profile ? calculatePnl({ profile, accountCurrency: acc.currency, direction, quantity: qty, entry, exit, conversionRate: rate, commissionPerQuantity: comm, commissionFixed: commFixed, swap }) : null;
  const err = useErrors(res && !res.ok ? res.errors : null, { quantity: qty, entry, exit, conversionRate: rate, commissionPerQuantity: comm, commissionFixed: commFixed, swap }, false);
  const r = res?.ok ? res.value : null;
  const unit = unitLabel(i, profile);
  return (
    <div className="calc-layout">
      <Card title={i.t('calc.pnl')}>
        <AccountInputs value={acc} onChange={setAcc} err={err} showAmount={false} />
        <InstrumentPicker value={profileId} onChange={setProfileId} />
        <Segmented label={i.t('common.direction')} value={direction} onChange={setDirection} options={[{ value: 'long', label: i.t('common.long') }, { value: 'short', label: i.t('common.short') }]} />
        <div className="grid3">
          <NumberInput label={`${i.t('common.quantity')} (${unit})`} value={qty} onChange={setQty} error={err('quantity')} />
          <NumberInput label={i.t('calc.entry')} value={entry} onChange={setEntry} error={err('entry')} />
          <NumberInput label={i.t('calc.exit')} value={exit} onChange={setExit} error={err('exit')} />
        </div>
        <ConversionInputs profile={profile} accountCurrency={acc.currency} rate={rate} asOf={asOf} onRate={setRate} onAsOf={setAsOf} err={err} />
        <details>
          <summary>{i.t('calc.costs')}</summary>
          <div className="grid2">
            <NumberInput label={i.t('calc.commissionPerQty', { unit })} value={comm} onChange={setComm} error={err('commissionPerQuantity')} optional />
            <NumberInput label={i.t('calc.commissionFixed')} value={commFixed} onChange={setCommFixed} error={err('commissionFixed')} optional />
            <NumberInput label={i.t('calc.swap')} value={swap} onChange={setSwap} error={err('swap')} optional />
          </div>
        </details>
      </Card>
      <Card title={i.t('calc.result')} className="result">
        {r && (
          <div aria-live="polite">
            <div className="big-result">
              <Money value={r.net} currency={acc.currency} sign />
            </div>
            <div className="stats">
              <Stat label={i.t('calc.priceMove')} value={<Num>{i.n(r.priceMove, undefined, { sign: true })}</Num>} />
              <Stat label={i.t('calc.gross')} value={<Money value={r.grossAccount} currency={acc.currency} sign />} />
              <Stat label={i.t('calc.totalCosts')} value={<Money value={r.costs} currency={acc.currency} />} />
            </div>
            <ConvLine conv={r.conversion} entry={exit} />
          </div>
        )}
      </Card>
    </div>
  );
}

function RiskReward() {
  const i = useI18n();
  const { fav } = useDefaults();
  const [acc, setAcc] = useAccountState();
  const [profileId, setProfileId] = useState(fav);
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [qty, setQty] = useState('');
  const [costs, setCosts] = useState('');
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState('');
  const [ratio, setRatio] = useState('2');
  const profile = useProfile(profileId);
  const res = calculateRiskReward({ direction, entry, stop, target, profile, quantity: qty, accountCurrency: acc.currency, conversionRate: rate, costs });
  const err = useErrors(res.ok ? null : res.errors, { entry, stop, target, quantity: qty, costs, conversionRate: rate }, false);
  const tgt = targetForRatio(direction, entry, stop, ratio);
  const r = res.ok ? res.value : null;
  return (
    <div className="calc-layout">
      <Card title={i.t('calc.rr')}>
        <Segmented label={i.t('common.direction')} value={direction} onChange={setDirection} options={[{ value: 'long', label: i.t('common.long') }, { value: 'short', label: i.t('common.short') }]} />
        <div className="grid3">
          <NumberInput label={i.t('calc.entry')} value={entry} onChange={setEntry} error={err('entry')} />
          <NumberInput label={i.t('calc.stop')} value={stop} onChange={setStop} error={err('stop')} />
          <NumberInput label={i.t('calc.target')} value={target} onChange={setTarget} error={err('target')} />
        </div>
        <details>
          <summary>{i.t('calc.costs')}</summary>
          <AccountInputs value={acc} onChange={setAcc} err={err} showAmount={false} />
          <InstrumentPicker value={profileId} onChange={setProfileId} />
          <div className="grid2">
            <NumberInput label={`${i.t('common.quantity')} (${unitLabel(i, profile)})`} value={qty} onChange={setQty} error={err('quantity')} optional />
            <NumberInput label={i.t('calc.totalCostsInput')} value={costs} onChange={setCosts} error={err('costs')} optional />
          </div>
          {qty && <ConversionInputs profile={profile} accountCurrency={acc.currency} rate={rate} asOf={asOf} onRate={setRate} onAsOf={setAsOf} err={err} />}
        </details>
        <h3>{i.t('calc.targetFromRatio')}</h3>
        <div className="grid2">
          <NumberInput label={i.t('calc.desiredRatio')} value={ratio} onChange={setRatio} />
          <Stat label={i.t('calc.targetPrice')} value={tgt.ok ? <Num>{i.n(tgt.value)}</Num> : '—'} />
        </div>
      </Card>
      <Card title={i.t('calc.result')} className="result">
        {r && (
          <div aria-live="polite">
            <div className="big-result">
              <Num>{i.n(r.ratio, 2)}</Num> : <Num>{i.n('1')}</Num>
            </div>
            <div className="stats">
              <Stat label={i.t('calc.riskDistance')} value={<Num>{i.n(r.riskDistance)}</Num>} />
              <Stat label={i.t('calc.rewardDistance')} value={<Num>{i.n(r.rewardDistance)}</Num>} />
              <Stat label={i.t('calc.breakEvenWinRate')} value={<Num>{i.n(r.breakEvenWinRate, 2)}%</Num>} />
              {r.cash && (
                <>
                  <Stat label={i.t('calc.cashRisk')} value={<Money value={r.cash.riskWithCosts} currency={acc.currency} />} />
                  <Stat label={i.t('calc.cashReward')} value={<Money value={r.cash.rewardAfterCosts} currency={acc.currency} />} />
                  <Stat label={i.t('calc.ratioAfterCosts')} value={r.cash.ratioAfterCosts ? <Num>{i.n(r.cash.ratioAfterCosts, 2)}</Num> : '—'} />
                </>
              )}
            </div>
          </div>
        )}
        <Assumptions keys={['assume.stopNotGuaranteed', r?.cash ? 'assume.costsModeled' : 'assume.costsExcluded']} />
      </Card>
    </div>
  );
}

function Portfolio() {
  const i = useI18n();
  const { settings, data } = useStore();
  const acc = data.accounts.find((a) => a.id === settings.defaultAccountId);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(acc?.baseCurrency ?? 'USD');
  const [rows, setRows] = useState([{ label: '', risk: '' }]);
  const res = summarizePortfolioRisk(rows.filter((r) => r.risk.trim() !== '' || r.label.trim() !== ''), amount);
  return (
    <div className="calc-layout">
      <Card title={i.t('calc.portfolio')}>
        <p className="muted">{i.t('calc.portfolioHelp')}</p>
        <div className="grid2">
          <TextInput label={i.t('calc.accountCurrency')} value={currency} ltr onChange={(v) => setCurrency(v.toUpperCase())} />
          <NumberInput label={i.t('calc.accountAmount')} value={amount} onChange={setAmount} optional />
        </div>
        {rows.map((r, idx) => (
          <div className="grid2 row-item" key={idx}>
            <TextInput label={`${i.t('calc.positionLabel')} ${idx + 1}`} value={r.label} onChange={(v) => setRows(rows.map((x, j) => (j === idx ? { ...x, label: v } : x)))} />
            <div className="row">
              <NumberInput label={`${i.t('calc.plannedRisk')} (${currency})`} value={r.risk} onChange={(v) => setRows(rows.map((x, j) => (j === idx ? { ...x, risk: v } : x)))} />
              <button type="button" className="icon-btn" aria-label={i.t('calc.removePosition', { n: idx + 1 })} onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== idx) : [{ label: '', risk: '' }])}>
                ×
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setRows([...rows, { label: '', risk: '' }])}>
          {i.t('calc.addPosition')}
        </button>
      </Card>
      <Card title={i.t('calc.result')} className="result">
        {res.ok ? (
          <div aria-live="polite">
            <Stat label={i.t('calc.nominalTotal')} value={<Money value={res.value.nominalTotal} currency={currency} />} sub={res.value.percentOfAccount ? <Num>{i.n(res.value.percentOfAccount, 2)}%</Num> : undefined} />
          </div>
        ) : (
          <p className="muted">{res.errors.map((e) => i.t(e.code)).filter((v, k, a) => a.indexOf(v) === k).join(' ')}</p>
        )}
        <Notice kind="warn">{i.t('calc.nominalWarning')}</Notice>
      </Card>
    </div>
  );
}
