import type { NumeralSystem } from './digits';

export type Language = 'en' | 'fa' | 'ar';
export type ThemePref = 'system' | 'light' | 'dark';
export type WidgetId = 'riskPreset' | 'sessions' | 'calendar' | 'performance' | 'favorites' | 'recentTrades' | 'backupReminder';
export const ALL_WIDGETS: WidgetId[] = ['sessions', 'riskPreset', 'performance', 'favorites', 'calendar', 'recentTrades', 'backupReminder'];

export interface WidgetPref {
  id: WidgetId;
  visible: boolean;
}

export interface CalendarFilter {
  currencies: string[]; // empty = all
  minImportance: 'all' | 'low' | 'medium' | 'high';
  showSample: boolean;
}

/** User-defined trading window (structurally compatible with @tc/sessions SessionDef). */
export interface UserWindow {
  id: string;
  name: string;
  zone: string;
  days: number[];
  open: string;
  close: string;
}

export interface Settings {
  language: Language;
  numerals: NumeralSystem | 'auto';
  /** IANA zone for display. 'device' = use the device zone at runtime. */
  timeZone: string;
  theme: ThemePref;
  fontScale: number; // 1 = 100 %
  defaultAccountId: string | null;
  riskPreset: { mode: 'percent' | 'cash'; value: string };
  favoriteProfileIds: string[];
  selectedSessionSet: 'fx' | 'exchange' | 'all';
  userWindows: UserWindow[];
  widgets: WidgetPref[];
  calendar: CalendarFilter;
  lastBackupAt: string | null;
  disclaimerAccepted: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  numerals: 'auto',
  timeZone: 'device',
  theme: 'system',
  fontScale: 1,
  defaultAccountId: null,
  riskPreset: { mode: 'percent', value: '1' },
  favoriteProfileIds: [],
  selectedSessionSet: 'fx',
  userWindows: [],
  widgets: ALL_WIDGETS.map((id) => ({ id, visible: true })),
  calendar: { currencies: [], minImportance: 'all', showSample: false },
  lastBackupAt: null,
  disclaimerAccepted: false,
};

export function moveWidget(widgets: WidgetPref[], id: WidgetId, delta: -1 | 1): WidgetPref[] {
  const i = widgets.findIndex((w) => w.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= widgets.length) return widgets;
  const next = widgets.slice();
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Merge persisted settings with defaults so new fields survive upgrades. */
export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(stored ?? {}) } as Settings;
  const known = new Set(s.widgets.map((w) => w.id));
  const widgets = s.widgets.filter((w) => (DEFAULT_SETTINGS.widgets.some((d) => d.id === w.id)));
  for (const d of DEFAULT_SETTINGS.widgets) if (!known.has(d.id)) widgets.push(d);
  return { ...s, widgets, calendar: { ...DEFAULT_SETTINGS.calendar, ...(stored?.calendar ?? {}) }, riskPreset: { ...DEFAULT_SETTINGS.riskPreset, ...(stored?.riskPreset ?? {}) } };
}
