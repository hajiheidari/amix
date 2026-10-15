import { D, isCurrencyCode, newId, parseDecimal, toPlain, validateProfile, type AssetClass, type InstrumentProfile, type MarginModel } from '@tc/domain';

/**
 * Import of broker contract specifications exported from the user's own
 * MetaTrader 4/5 terminal by the bundled `AmixExport` script. The data is the
 * user's own broker data; nothing is fetched from third-party services.
 */
export const MT_FORMAT = 'amix-mt-symbols';
export const MT_VERSION = 1;
export const MT_MAX_BYTES = 10 * 1024 * 1024;
export const MT_MAX_SYMBOLS = 5000;

export interface MtAccount {
  company: string;
  server: string;
  currency: string;
  leverage: number;
}

export interface MtSymbol {
  name: string;
  description: string;
  path: string;
  digits: number;
  point: number;
  contractSize: number;
  tickSize: number;
  /** In ACCOUNT (deposit) currency, as reported by the terminal at export time. */
  tickValue: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  baseCurrency: string;
  profitCurrency: string;
  marginCurrency: string;
  /** e.g. SYMBOL_CALC_MODE_FOREX (MT5 enum names; MT4 is mapped by the script). */
  calcMode: string;
  /** Fixed initial margin per lot (futures/exchange modes), 0 if not used. */
  marginInitial: number;
  /** Initial margin rate multiplier for buy orders (MT5), 1 if unknown. */
  marginRate: number;
  /** false when trading is disabled for the symbol. */
  tradeAllowed: boolean;
}

export interface MtExport {
  format: typeof MT_FORMAT;
  version: number;
  platform: 'MT4' | 'MT5';
  exportedAt: string;
  account: MtAccount;
  symbols: MtSymbol[];
}

export type MtWarning =
  | 'mt.warn.marginUnsupported'
  | 'mt.warn.tickValueDeposit'
  | 'mt.warn.tradeDisabled'
  | 'mt.warn.unknownCalcMode'
  | 'mt.warn.marginRateUnknown';

export interface MtMapped {
  symbol: string;
  description: string;
  profile: InstrumentProfile | null;
  warnings: MtWarning[];
  /** Error key when the symbol cannot be mapped to a valid linear profile. */
  error: string | null;
}

export type MtParse = { ok: true; value: MtExport } | { ok: false; code: string; detail?: string };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function parseMtExport(text: string, byteLength = text.length): MtParse {
  if (byteLength > MT_MAX_BYTES) return { ok: false, code: 'mt.err.tooLarge' };
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\ufeff/, ''));
  } catch {
    return { ok: false, code: 'mt.err.notJson' };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, code: 'mt.err.wrongFormat' };
  const r = raw as Record<string, unknown>;
  if (r.format !== MT_FORMAT) return { ok: false, code: 'mt.err.wrongFormat' };
  if (typeof r.version !== 'number' || r.version > MT_VERSION) return { ok: false, code: 'mt.err.newerVersion' };
  const acc = (r.account ?? {}) as Record<string, unknown>;
  const account: MtAccount = { company: str(acc.company).trim(), server: str(acc.server).trim(), currency: str(acc.currency).trim().toUpperCase(), leverage: num(acc.leverage) ?? 0 };
  if (!Array.isArray(r.symbols)) return { ok: false, code: 'mt.err.wrongFormat' };
  if (r.symbols.length === 0) return { ok: false, code: 'mt.err.empty' };
  if (r.symbols.length > MT_MAX_SYMBOLS) return { ok: false, code: 'mt.err.tooMany' };
  const symbols: MtSymbol[] = [];
  for (const [i, s0] of r.symbols.entries()) {
    if (typeof s0 !== 'object' || s0 === null) return { ok: false, code: 'mt.err.badRecord', detail: String(i) };
    const s = s0 as Record<string, unknown>;
    const name = str(s.name).trim();
    if (!name) return { ok: false, code: 'mt.err.badRecord', detail: String(i) };
    symbols.push({
      name,
      description: str(s.description),
      path: str(s.path),
      digits: num(s.digits) ?? 0,
      point: num(s.point) ?? 0,
      contractSize: num(s.contractSize) ?? 0,
      tickSize: num(s.tickSize) ?? 0,
      tickValue: num(s.tickValue) ?? 0,
      volumeMin: num(s.volumeMin) ?? 0,
      volumeMax: num(s.volumeMax) ?? 0,
      volumeStep: num(s.volumeStep) ?? 0,
      baseCurrency: str(s.baseCurrency).trim().toUpperCase(),
      profitCurrency: str(s.profitCurrency).trim().toUpperCase(),
      marginCurrency: str(s.marginCurrency).trim().toUpperCase(),
      calcMode: str(s.calcMode).trim().toUpperCase(),
      marginInitial: num(s.marginInitial) ?? 0,
      marginRate: num(s.marginRate) ?? 1,
      tradeAllowed: s.tradeAllowed !== false,
    });
  }
  return { ok: true, value: { format: MT_FORMAT, version: r.version, platform: r.platform === 'MT4' ? 'MT4' : 'MT5', exportedAt: str(r.exportedAt), account, symbols } };
}

/** Number → canonical decimal string without binary noise (MetaTrader doubles carry up to ~10 significant decimals). */
export function mtDec(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return toPlain(D(n.toPrecision(12)));
}

const METALS = ['XAU', 'XAG', 'XPT', 'XPD'];
const PRICE_MODES = new Set(['SYMBOL_CALC_MODE_FOREX', 'SYMBOL_CALC_MODE_FOREX_NO_LEVERAGE', 'SYMBOL_CALC_MODE_CFD', 'SYMBOL_CALC_MODE_CFDLEVERAGE', 'SYMBOL_CALC_MODE_EXCH_STOCKS', 'SYMBOL_CALC_MODE_EXCH_STOCKS_MOEX']);
const TICK_MODES = new Set(['SYMBOL_CALC_MODE_FUTURES', 'SYMBOL_CALC_MODE_CFDINDEX', 'SYMBOL_CALC_MODE_EXCH_FUTURES', 'SYMBOL_CALC_MODE_EXCH_FUTURES_FORTS']);

export function classify(s: MtSymbol): AssetClass {
  const path = s.path.toLowerCase();
  const isMetal = METALS.includes(s.baseCurrency) || /metal|gold|silver/.test(path);
  if (TICK_MODES.has(s.calcMode) && s.calcMode !== 'SYMBOL_CALC_MODE_CFDINDEX') return 'future';
  if (s.calcMode.startsWith('SYMBOL_CALC_MODE_FOREX')) return isMetal ? 'metal_cfd' : 'fx';
  if (s.calcMode.startsWith('SYMBOL_CALC_MODE_EXCH_STOCKS')) return 'share';
  if (isMetal) return 'metal_cfd';
  if (/indic|index|indices/.test(path) || s.calcMode === 'SYMBOL_CALC_MODE_CFDINDEX') return 'index_cfd';
  if (/stock|share|equit/.test(path)) return 'cfd';
  return 'cfd';
}

/**
 * MT5 margin formulas mapped to the app's margin models (estimates; tiered or
 * floating margin is not modelled):
 *   FOREX            lots × contract × rate / leverage            → leverage (acc.leverage / rate)
 *   FOREX_NO_LEVERAGE lots × contract × rate                      → percent_notional (100 × rate)
 *   CFD, EXCH_STOCKS lots × contract × price × rate               → percent_notional (100 × rate)
 *   CFDLEVERAGE      lots × contract × price × rate / leverage    → leverage (acc.leverage / rate)
 *   FUTURES & exch.  lots × initialMargin × rate                  → fixed_per_quantity
 *   others           → unsupported
 */
export function mapMargin(s: MtSymbol, a: MtAccount, warnings: MtWarning[]): MarginModel {
  const rate = s.marginRate;
  const rateKnown = rate > 0;
  if (!rateKnown && !s.calcMode.includes('FUTURES')) {
    // Never assume a margin rate the terminal did not report.
    warnings.push('mt.warn.marginRateUnknown');
    return { kind: 'unsupported', note: 'MetaTrader did not report a margin rate for this symbol' };
  }
  switch (s.calcMode) {
    case 'SYMBOL_CALC_MODE_FOREX':
    case 'SYMBOL_CALC_MODE_CFDLEVERAGE':
      if (a.leverage > 0) return { kind: 'leverage', leverage: mtDec(a.leverage / rate) };
      break;
    case 'SYMBOL_CALC_MODE_FOREX_NO_LEVERAGE':
    case 'SYMBOL_CALC_MODE_CFD':
    case 'SYMBOL_CALC_MODE_EXCH_STOCKS':
    case 'SYMBOL_CALC_MODE_EXCH_STOCKS_MOEX': {
      const pct = 100 * rate;
      if (pct > 0 && pct <= 100) return { kind: 'percent_notional', percent: mtDec(pct) };
      break;
    }
    case 'SYMBOL_CALC_MODE_FUTURES':
    case 'SYMBOL_CALC_MODE_EXCH_FUTURES':
    case 'SYMBOL_CALC_MODE_EXCH_FUTURES_FORTS':
      if (s.marginInitial > 0 && isCurrencyCode(s.marginCurrency || a.currency)) return { kind: 'fixed_per_quantity', amount: mtDec(s.marginInitial * (rateKnown ? rate : 1)), currency: s.marginCurrency || a.currency };
      break;
  }
  warnings.push('mt.warn.marginUnsupported');
  return { kind: 'unsupported', note: `MetaTrader margin mode ${s.calcMode || 'unknown'}` };
}

export function mapSymbol(s: MtSymbol, exp: Pick<MtExport, 'account' | 'platform' | 'exportedAt'>, existing?: InstrumentProfile): MtMapped {
  const a = exp.account;
  const warnings: MtWarning[] = [];
  if (!s.tradeAllowed) warnings.push('mt.warn.tradeDisabled');
  const known = PRICE_MODES.has(s.calcMode) || TICK_MODES.has(s.calcMode);
  if (!known) {
    return { symbol: s.name, description: s.description, profile: null, warnings: ['mt.warn.unknownCalcMode'], error: 'mt.err.unsupportedMode' };
  }
  const assetClass = classify(s);
  let multiplier: number;
  let settlement: string;
  if (TICK_MODES.has(s.calcMode)) {
    // Profit = Δprice × tickValue / tickSize × lots; tickValue is in the deposit currency.
    if (!(s.tickSize > 0) || !(s.tickValue > 0)) return { symbol: s.name, description: s.description, profile: null, warnings, error: 'mt.err.missingTick' };
    multiplier = s.tickValue / s.tickSize;
    settlement = a.currency;
    if (s.profitCurrency && s.profitCurrency !== a.currency) warnings.push('mt.warn.tickValueDeposit');
  } else {
    multiplier = s.contractSize;
    settlement = s.profitCurrency || a.currency;
  }
  const tick = s.tickSize > 0 ? s.tickSize : s.point;
  const pip = assetClass === 'fx' && s.point > 0 ? (s.digits === 5 || s.digits === 3 ? s.point * 10 : s.point) : null;
  const margin = mapMargin(s, a, warnings);
  const broker = [a.company, a.server].filter(Boolean).join(' · ') || `MetaTrader ${exp.platform}`;
  const exportedDate = (exp.exportedAt || '').slice(0, 10) || null;
  const now = new Date().toISOString();
  const profile: InstrumentProfile = {
    id: existing?.id ?? newId('p'),
    version: existing?.version ?? 0,
    symbol: s.name,
    displayName: s.description || s.name,
    broker,
    assetClass,
    contractType: 'linear',
    baseCurrency: s.baseCurrency && isCurrencyCode(s.baseCurrency) ? s.baseCurrency : null,
    quoteCurrency: isCurrencyCode(s.profitCurrency) ? s.profitCurrency : settlement,
    settlementCurrency: settlement,
    quantityUnit: assetClass === 'future' ? 'contract' : assetClass === 'share' && s.contractSize === 1 ? 'share' : 'lot',
    contractMultiplier: mtDec(multiplier),
    tickSize: mtDec(tick),
    pipSize: pip ? mtDec(pip) : null,
    minQuantity: mtDec(s.volumeMin),
    maxQuantity: s.volumeMax > 0 ? mtDec(s.volumeMax) : null,
    quantityStep: mtDec(s.volumeStep),
    margin,
    verification: 'broker_verified',
    source: `Imported from ${exp.platform} terminal export (${broker}) on ${exportedDate ?? 'unknown date'}. Margin assumes account leverage 1:${a.leverage || '?'}; tiered/dynamic margin is not modelled.`,
    verifiedAt: exportedDate,
    notes: s.path,
    favorite: existing?.favorite ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!parseDecimal(profile.contractMultiplier)?.gt(0)) return { symbol: s.name, description: s.description, profile: null, warnings, error: 'mt.err.invalidSpec' };
  const v = validateProfile(profile);
  if (!v.ok) return { symbol: s.name, description: s.description, profile: null, warnings, error: 'mt.err.invalidSpec' };
  return { symbol: s.name, description: s.description, profile, warnings, error: null };
}

/** Match an existing profile by exact symbol + broker label, so re-imports update (new version) instead of duplicating. */
export function mapExport(exp: MtExport, existing: InstrumentProfile[]): MtMapped[] {
  const broker = [exp.account.company, exp.account.server].filter(Boolean).join(' · ') || `MetaTrader ${exp.platform}`;
  return exp.symbols.map((s) => mapSymbol(s, exp, existing.find((p) => p.symbol === s.name && p.broker === broker)));
}

