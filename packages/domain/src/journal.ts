import type { DecimalString } from './decimal';
import type { InstrumentProfile } from './instrument';

export interface Account {
  id: string;
  name: string;
  baseCurrency: string;
  /** Whether the opening figure is a cash balance or an equity reading. */
  openingKind: 'balance' | 'equity';
  openingAmount: DecimalString;
  openingDate: string; // ISO instant
  broker: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Cashflow {
  id: string;
  accountId: string;
  type: 'deposit' | 'withdrawal';
  /** Always positive; sign follows from type. */
  amount: DecimalString;
  at: string; // ISO instant
  note: string;
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Direction = 'long' | 'short';

export interface Fill {
  id: string;
  side: 'entry' | 'exit';
  quantity: DecimalString;
  price: DecimalString;
  at: string; // ISO instant (UTC)
}

/** Rate that converts settlement-currency amounts into the account currency. */
export interface ConversionSnapshot {
  from: string;
  to: string;
  rate: DecimalString;
  source: 'identity' | 'manual' | 'instrument_price' | 'imported';
  asOf: string; // ISO instant
}

export interface TradeCosts {
  /** All costs are in the account currency, positive = cost, negative = rebate/credit. */
  commission: DecimalString;
  swap: DecimalString;
  other: DecimalString;
}

export type PnlMode =
  /** P&L computed from fills, profile snapshot and conversion snapshot, minus costs. */
  | 'computed'
  /** User/imported realized P&L, NET of all costs. Costs are kept for information only and are not subtracted again. */
  | 'manual_net';

export interface Trade {
  id: string;
  accountId: string;
  /** Frozen copy of the instrument profile at the time of entry; later profile edits never rewrite history. */
  profile: InstrumentProfile;
  direction: Direction;
  fills: Fill[];
  initialStop: DecimalString | null;
  initialTarget: DecimalString | null;
  /** Initial cash risk in account currency; null = R multiples unavailable. */
  initialRisk: DecimalString | null;
  conversion: ConversionSnapshot | null;
  costs: TradeCosts;
  pnlMode: PnlMode;
  manualNetPnl: DecimalString | null;
  strategy: string;
  setup: string;
  tags: string[];
  emotions: string[];
  mistakes: string[];
  notes: string;
  importBatchId: string | null;
  /** Stable fingerprint used for duplicate detection on import. */
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatch {
  id: string;
  kind: 'trades_csv';
  fileName: string;
  createdAt: string;
  tradeIds: string[];
  cashflowIds: string[];
  undone: boolean;
}
