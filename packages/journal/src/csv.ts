import Papa from 'papaparse';
import { DateTime } from 'luxon';
import { Dec, err, newId, normalizeNumericInput, nowIso, type Account, type FieldError, type InstrumentProfile, type Trade } from '@tc/domain';
import { computeInitialRisk, summarizeTrade, tradeFingerprint, validateTrade } from './trade';

export const CSV_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 20_000 };

/* ------------------------------------------------------------------ */
/* Writing                                                              */
/* ------------------------------------------------------------------ */

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Neutralize spreadsheet formula injection. Legitimate numbers (including
 * negative values such as "-12.5") are left untouched; any other text that
 * starts with = + - @ TAB or CR is prefixed with an apostrophe.
 */
export function neutralizeCell(value: string): string {
  if (!FORMULA_START.test(value)) return value;
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  return `'${value}`;
}

export function csvCell(value: string | number | null | undefined, kind: 'text' | 'number' = 'text'): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (kind === 'text') s = neutralizeCell(s);
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: (string | null)[][], numericColumns: Set<string> = new Set()): string {
  const lines = [header.map((h) => csvCell(h)).join(',')];
  for (const r of rows) lines.push(r.map((v, i) => csvCell(v, numericColumns.has(header[i]!) ? 'number' : 'text')).join(','));
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

/**
 * Canonical journal CSV: one row per fill. Trade-level fields are repeated on
 * every row of the same trade_ref. Times are ISO-8601 UTC.
 */
export const CANONICAL_COLUMNS = [
  'trade_ref', 'account', 'account_currency', 'symbol', 'direction', 'fill_side', 'quantity', 'price', 'time_utc',
  'initial_stop', 'initial_target', 'initial_risk', 'conversion_rate', 'commission', 'swap', 'other_costs',
  'pnl_mode', 'realized_pnl_net', 'strategy', 'setup', 'tags', 'emotions', 'mistakes', 'notes',
] as const;
export type CanonicalColumn = (typeof CANONICAL_COLUMNS)[number];

const NUMERIC: Set<string> = new Set(['quantity', 'price', 'initial_stop', 'initial_target', 'initial_risk', 'conversion_rate', 'commission', 'swap', 'other_costs', 'realized_pnl_net', 'computed_net_pnl']);

export function exportTradesCsv(trades: Trade[], accounts: Account[]): string {
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const rows: (string | null)[][] = [];
  for (const t of trades) {
    const a = acc.get(t.accountId);
    const fills = t.fills.slice().sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
    for (const f of fills) {
      const rec: Record<CanonicalColumn, string | null> = {
        trade_ref: t.id,
        account: a?.name ?? '',
        account_currency: a?.baseCurrency ?? '',
        symbol: t.profile.symbol,
        direction: t.direction,
        fill_side: f.side,
        quantity: f.quantity,
        price: f.price,
        time_utc: new Date(Date.parse(f.at)).toISOString(),
        initial_stop: t.initialStop,
        initial_target: t.initialTarget,
        initial_risk: t.initialRisk,
        conversion_rate: t.conversion?.rate ?? null,
        commission: t.costs.commission,
        swap: t.costs.swap,
        other_costs: t.costs.other,
        pnl_mode: t.pnlMode,
        realized_pnl_net: t.pnlMode === 'manual_net' ? t.manualNetPnl : null,
        strategy: t.strategy,
        setup: t.setup,
        tags: t.tags.join(';'),
        emotions: t.emotions.join(';'),
        mistakes: t.mistakes.join(';'),
        notes: t.notes,
      };
      rows.push(CANONICAL_COLUMNS.map((c) => rec[c]));
    }
  }
  return toCsv([...CANONICAL_COLUMNS], rows, NUMERIC);
}

/* ------------------------------------------------------------------ */
/* Reading                                                              */
/* ------------------------------------------------------------------ */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export type ParseCsvResult = { ok: true; value: ParsedCsv } | { ok: false; code: string; params?: Record<string, number> };

export function parseCsv(text: string, byteLength = new Blob([text]).size): ParseCsvResult {
  if (byteLength > CSV_LIMITS.maxBytes) return { ok: false, code: 'import.fileTooLarge', params: { max: CSV_LIMITS.maxBytes / 1024 / 1024 } };
  const clean = text.replace(/^\ufeff/, '');
  const res = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy' });
  const fatal = res.errors.find((e) => e.type === 'Quotes');
  if (fatal) return { ok: false, code: 'import.malformedCsv', params: { row: (fatal.row ?? 0) + 1 } };
  const data = res.data;
  if (data.length < 2) return { ok: false, code: 'import.empty' };
  if (data.length - 1 > CSV_LIMITS.maxRows) return { ok: false, code: 'import.tooManyRows', params: { max: CSV_LIMITS.maxRows } };
  const headers = data[0]!.map((h) => h.trim());
  return { ok: true, value: { headers, rows: data.slice(1) } };
}

export type RowShape = 'fills' | 'round_trip';

/** Import target fields. Round-trip rows describe one trade with an open and optional close. */
export const IMPORT_FIELDS: Record<RowShape, { field: string; required: boolean }[]> = {
  fills: [
    { field: 'trade_ref', required: true }, { field: 'symbol', required: true }, { field: 'direction', required: true },
    { field: 'fill_side', required: true }, { field: 'quantity', required: true }, { field: 'price', required: true }, { field: 'time', required: true },
    { field: 'initial_stop', required: false }, { field: 'initial_target', required: false }, { field: 'initial_risk', required: false },
    { field: 'conversion_rate', required: false }, { field: 'commission', required: false }, { field: 'swap', required: false }, { field: 'other_costs', required: false },
    { field: 'realized_pnl_net', required: false }, { field: 'strategy', required: false }, { field: 'setup', required: false },
    { field: 'tags', required: false }, { field: 'emotions', required: false }, { field: 'mistakes', required: false }, { field: 'notes', required: false },
  ],
  round_trip: [
    { field: 'symbol', required: true }, { field: 'direction', required: true }, { field: 'quantity', required: true },
    { field: 'open_time', required: true }, { field: 'open_price', required: true }, { field: 'close_time', required: false }, { field: 'close_price', required: false },
    { field: 'initial_stop', required: false }, { field: 'initial_target', required: false }, { field: 'initial_risk', required: false },
    { field: 'conversion_rate', required: false }, { field: 'commission', required: false }, { field: 'swap', required: false }, { field: 'other_costs', required: false },
    { field: 'realized_pnl_net', required: false }, { field: 'strategy', required: false }, { field: 'setup', required: false },
    { field: 'tags', required: false }, { field: 'emotions', required: false }, { field: 'mistakes', required: false }, { field: 'notes', required: false },
  ],
};

/** field → column index */
export type ColumnMapping = Record<string, number | null>;

const ALIASES: Record<string, string[]> = {
  trade_ref: ['trade_ref', 'trade id', 'ticket', 'position', 'id'],
  time: ['time_utc', 'time', 'date', 'datetime'],
  open_time: ['open_time', 'open time', 'entry time', 'opened'],
  close_time: ['close_time', 'close time', 'exit time', 'closed'],
  open_price: ['open_price', 'open price', 'entry price', 'entry'],
  close_price: ['close_price', 'close price', 'exit price', 'exit'],
  direction: ['direction', 'side', 'type'],
  quantity: ['quantity', 'qty', 'volume', 'size', 'lots'],
  initial_stop: ['initial_stop', 'stop', 's/l', 'sl', 'stop loss'],
  initial_target: ['initial_target', 'target', 't/p', 'tp', 'take profit'],
  realized_pnl_net: ['realized_pnl_net', 'net profit', 'net p&l', 'net pnl'],
};

export function guessMapping(headers: string[], shape: RowShape): ColumnMapping {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const m: ColumnMapping = {};
  for (const { field } of IMPORT_FIELDS[shape]) {
    const cands = ALIASES[field] ?? [field];
    const idx = norm.findIndex((h) => cands.includes(h) || h === field);
    m[field] = idx >= 0 ? idx : null;
  }
  return m;
}

export type DateFormat = 'iso' | 'ymd_dots' | 'dmy' | 'mdy';

export interface ImportOptions {
  shape: RowShape;
  mapping: ColumnMapping;
  account: Account;
  profiles: InstrumentProfile[];
  existingTrades: Trade[];
  /** IANA zone used for timestamps that carry no explicit offset. */
  zone: string;
  dateFormat: DateFormat;
  importBatchId: string;
}

export interface RowIssue {
  row: number; // 1-based data row (header excluded); for 'fills' shape, the first row of the trade
  errors: FieldError[];
}

export interface ImportPreview {
  valid: Trade[];
  duplicates: { row: number; trade: Trade }[];
  invalid: RowIssue[];
  totalRows: number;
}

const FORMATS: Record<DateFormat, string[]> = {
  iso: ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm", 'yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy-MM-dd'],
  ymd_dots: ['yyyy.MM.dd HH:mm:ss', 'yyyy.MM.dd HH:mm', 'yyyy.MM.dd'],
  dmy: ['dd/MM/yyyy HH:mm:ss', 'dd/MM/yyyy HH:mm', 'dd/MM/yyyy', 'd/M/yyyy H:mm'],
  mdy: ['MM/dd/yyyy HH:mm:ss', 'MM/dd/yyyy HH:mm', 'MM/dd/yyyy', 'M/d/yyyy H:mm'],
};

/** Parse a timestamp. Explicit offsets/Z win; otherwise it is interpreted in `zone`. */
export function parseTimestamp(raw: string, fmt: DateFormat, zone: string): string | null {
  const s = normalizeDigitsOnly(raw).trim();
  if (!s) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s) && fmt === 'iso') {
    const d = DateTime.fromISO(s.replace(' ', 'T'), { setZone: true });
    return d.isValid ? d.toUTC().toISO() : null;
  }
  for (const f of FORMATS[fmt]) {
    const d = DateTime.fromFormat(s, f, { zone });
    if (d.isValid) return d.toUTC().toISO();
  }
  return null;
}

function normalizeDigitsOnly(s: string): string {
  return s.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
}

function num(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === '') return null;
  return normalizeNumericInput(raw);
}

function direction(raw: string | undefined): 'long' | 'short' | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (['long', 'buy', 'b', 'خرید', 'شراء'].includes(s)) return 'long';
  if (['short', 'sell', 's', 'فروش', 'بيع'].includes(s)) return 'short';
  return null;
}

const list = (raw: string | undefined) => (raw ?? '').split(/[;|]/).map((x) => x.trim()).filter(Boolean);
const text = (raw: string | undefined) => (raw ?? '').replace(/^'(?=[=+\-@\t\r])/, '');

/** Build trades from mapped rows without committing anything. */
export function previewImport(parsed: ParsedCsv, o: ImportOptions): ImportPreview {
  const get = (row: string[], field: string): string | undefined => {
    const idx = o.mapping[field];
    return idx === null || idx === undefined ? undefined : row[idx];
  };
  const profileBySymbol = new Map(o.profiles.map((p) => [p.symbol.toUpperCase(), p]));
  const existing = new Set(o.existingTrades.filter((t) => t.accountId === o.account.id).map((t) => t.fingerprint));
  const seen = new Set<string>();
  const out: ImportPreview = { valid: [], duplicates: [], invalid: [], totalRows: parsed.rows.length };

  for (const { field, required } of IMPORT_FIELDS[o.shape]) {
    if (required && (o.mapping[field] === null || o.mapping[field] === undefined)) {
      out.invalid.push({ row: 0, errors: [err(field, 'import.unmappedRequired')] });
    }
  }
  if (out.invalid.length) return out;

  // Group rows into trades.
  const groups: { row: number; rows: string[][] }[] = [];
  if (o.shape === 'fills') {
    const byRef = new Map<string, { row: number; rows: string[][] }>();
    parsed.rows.forEach((r, i) => {
      const ref = (get(r, 'trade_ref') ?? '').trim();
      const key = ref || `__row${i}`;
      if (!byRef.has(key)) {
        const g = { row: i + 1, rows: [] as string[][] };
        byRef.set(key, g);
        groups.push(g);
      }
      byRef.get(key)!.rows.push(r);
    });
  } else {
    parsed.rows.forEach((r, i) => groups.push({ row: i + 1, rows: [r] }));
  }

  for (const g of groups) {
    const e: FieldError[] = [];
    const first = g.rows[0]!;
    const symbol = (get(first, 'symbol') ?? '').trim();
    const profile = profileBySymbol.get(symbol.toUpperCase());
    if (!symbol) e.push(err('symbol', 'error.required'));
    else if (!profile) e.push(err('symbol', 'import.unknownSymbol', { symbol }));
    const dir = direction(get(first, 'direction'));
    if (!dir) e.push(err('direction', 'import.badDirection'));

    const fills: Trade['fills'] = [];
    const addFill = (side: 'entry' | 'exit', qRaw: string | undefined, pRaw: string | undefined, tRaw: string | undefined, f: string) => {
      const q = num(qRaw);
      const p = num(pRaw);
      const at = parseTimestamp(tRaw ?? '', o.dateFormat, o.zone);
      if (!q) e.push(err(`${f}quantity`, 'error.notANumber'));
      if (!p) e.push(err(`${f}price`, 'error.notANumber'));
      if (!at) e.push(err(`${f}time`, 'error.invalidDate'));
      if (q && p && at) fills.push({ id: newId('f'), side, quantity: q, price: p, at });
    };
    if (o.shape === 'fills') {
      const rowKeys = g.rows.map((r) => r.join('\u0000'));
      if (new Set(rowKeys).size !== rowKeys.length) e.push(err('fills', 'import.duplicateRow'));
      for (const r of g.rows) {
        const sideRaw = (get(r, 'fill_side') ?? '').trim().toLowerCase();
        const side = sideRaw === 'entry' || sideRaw === 'in' ? 'entry' : sideRaw === 'exit' || sideRaw === 'out' ? 'exit' : null;
        if (!side) e.push(err('fill_side', 'import.badFillSide'));
        else addFill(side, get(r, 'quantity'), get(r, 'price'), get(r, 'time'), '');
      }
    } else {
      addFill('entry', get(first, 'quantity'), get(first, 'open_price'), get(first, 'open_time'), 'open_');
      const cp = get(first, 'close_price');
      const ct = get(first, 'close_time');
      if ((cp ?? '').trim() || (ct ?? '').trim()) addFill('exit', get(first, 'quantity'), cp, ct, 'close_');
    }

    const numOpt = (field: string): string | null => {
      const raw = get(first, field);
      if (raw === undefined || raw.trim() === '') return null;
      const n = num(raw);
      if (n === null) e.push(err(field, 'error.notANumber'));
      return n;
    };
    const stop = numOpt('initial_stop');
    const target = numOpt('initial_target');
    const riskIn = numOpt('initial_risk');
    const rate = numOpt('conversion_rate');
    const commission = numOpt('commission') ?? '0';
    const swap = numOpt('swap') ?? '0';
    const other = numOpt('other_costs') ?? '0';
    const manual = numOpt('realized_pnl_net');

    if (e.length || !profile || !dir) {
      out.invalid.push({ row: g.row, errors: e });
      continue;
    }
    const sameCcy = profile.settlementCurrency === o.account.baseCurrency;
    if (!sameCcy && !rate && manual === null) {
      out.invalid.push({ row: g.row, errors: [err('conversion_rate', 'error.conversionRequired', { from: profile.settlementCurrency, to: o.account.baseCurrency })] });
      continue;
    }
    const now = nowIso();
    const firstAt = fills.map((f) => f.at).sort()[0] ?? now;
    const conversion = sameCcy
      ? { from: profile.settlementCurrency, to: o.account.baseCurrency, rate: '1', source: 'identity' as const, asOf: firstAt }
      : rate
        ? { from: profile.settlementCurrency, to: o.account.baseCurrency, rate, source: 'imported' as const, asOf: firstAt }
        : null;
    const trade: Trade = {
      id: newId('t'),
      accountId: o.account.id,
      profile: { ...profile },
      direction: dir,
      fills,
      initialStop: stop,
      initialTarget: target,
      initialRisk: null,
      conversion,
      costs: { commission, swap, other },
      pnlMode: manual !== null ? 'manual_net' : 'computed',
      manualNetPnl: manual,
      strategy: text(get(first, 'strategy')).trim(),
      setup: text(get(first, 'setup')).trim(),
      tags: list(text(get(first, 'tags'))),
      emotions: list(text(get(first, 'emotions'))),
      mistakes: list(text(get(first, 'mistakes'))),
      notes: text(get(first, 'notes')),
      importBatchId: o.importBatchId,
      fingerprint: '',
      createdAt: now,
      updatedAt: now,
    };
    trade.initialRisk = riskIn ?? (computeInitialRisk(trade)?.toFixed() ?? null);
    trade.fingerprint = tradeFingerprint(trade);
    const v = validateTrade(trade, o.account);
    if (!v.ok) {
      out.invalid.push({ row: g.row, errors: v.errors });
      continue;
    }
    if (existing.has(trade.fingerprint) || seen.has(trade.fingerprint)) {
      out.duplicates.push({ row: g.row, trade });
      continue;
    }
    seen.add(trade.fingerprint);
    out.valid.push(trade);
  }
  return out;
}

/** Export closed-trade summary rows (one per trade), useful for spreadsheets. */
export function exportSummaryCsv(trades: Trade[], accounts: Account[]): string {
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const header = ['trade_ref', 'account', 'account_currency', 'symbol', 'direction', 'status', 'entry_qty', 'avg_entry', 'exit_qty', 'avg_exit', 'first_entry_utc', 'last_exit_utc', 'pnl_source', 'computed_net_pnl', 'strategy', 'tags'];
  const rows = trades.map((t) => {
    const a = acc.get(t.accountId);
    const s = summarizeTrade(t, a?.baseCurrency);
    const f = (d: Dec | null) => (d ? d.toFixed() : null);
    return [t.id, a?.name ?? '', a?.baseCurrency ?? '', t.profile.symbol, t.direction, s.status, s.entryQty.toFixed(), f(s.avgEntry), s.exitQty.toFixed(), f(s.avgExit), s.firstEntryAt, s.lastExitAt, s.pnlSource, f(s.net), t.strategy, t.tags.join(';')];
  });
  return toCsv(header, rows, new Set(['entry_qty', 'avg_entry', 'exit_qty', 'avg_exit', 'computed_net_pnl']));
}


