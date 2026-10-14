import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Account, Cashflow, ImportBatch, InstrumentProfile, Settings, Trade } from '@tc/domain';
import type { CalendarEvent } from '@tc/data-contracts';
import { IndexedDbRepository, StorageError, type Repository, type WriteOp } from '@tc/storage';
import { loadSettings, saveSettingsOp, seedIfNeeded } from './services';

export interface Data {
  accounts: Account[];
  cashflows: Cashflow[];
  trades: Trade[];
  profiles: InstrumentProfile[];
  importBatches: ImportBatch[];
  userEvents: CalendarEvent[];
}

export interface Store {
  repo: Repository;
  data: Data;
  settings: Settings;
  /** Re-read everything from persistent storage (the single source of truth). */
  reload: () => Promise<void>;
  commit: (ops: WriteOp[]) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  persisted: boolean | null;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreContext missing');
  return s;
}

function initialLanguage(): Settings['language'] {
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const l of langs) {
    const p = l.toLowerCase().slice(0, 2);
    if (p === 'fa' || p === 'ar' || p === 'en') return p;
  }
  return 'en';
}

async function openRepo(): Promise<Repository> {
  // IndexedDB on the web and inside the Capacitor WebView. If it cannot be opened the app
  // shows an error instead of silently running on non-persistent memory.
  return IndexedDbRepository.open();
}

export function StoreProvider({ children, fallback, onError }: { children: ReactNode; fallback: ReactNode; onError: (code: string) => ReactNode }) {
  const [state, setState] = useState<{ repo: Repository; data: Data; settings: Settings } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const repoRef = useRef<Repository | null>(null);

  const readAll = useCallback(async (repo: Repository) => {
    const s = await repo.snapshot();
    const settings = await loadSettings(repo);
    const data: Data = { accounts: s.accounts, cashflows: s.cashflows, trades: s.trades, profiles: s.profiles, importBatches: s.importBatches, userEvents: s.userEvents };
    setState({ repo, data, settings });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const repo = await openRepo();
        repoRef.current = repo;
        await seedIfNeeded(repo, { language: initialLanguage() });
        if (!cancelled) await readAll(repo);
        if (navigator.storage?.persist) {
          const already = await navigator.storage.persisted?.();
          setPersisted(already || (await navigator.storage.persist().catch(() => false)));
        }
      } catch (e) {
        setError(e instanceof StorageError ? e.code : 'unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readAll]);

  const store = useMemo<Store | null>(() => {
    if (!state) return null;
    const { repo } = state;
    return {
      ...state,
      persisted,
      reload: () => readAll(repo),
      commit: async (ops) => {
        await repo.commit(ops);
        await readAll(repo);
      },
      updateSettings: async (patch) => {
        const next = { ...state.settings, ...patch };
        setState((s) => (s ? { ...s, settings: next } : s));
        await repo.commit([saveSettingsOp(next)]);
      },
    };
  }, [state, persisted, readAll]);

  if (error) return <>{onError(error)}</>;
  if (!store) return <>{fallback}</>;
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
