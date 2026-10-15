import { useEffect, useState } from 'react';
import { fetchCatalogIndex, needsCheck, updateAvailable, type CatalogEntry } from '@tc/data-contracts';
import { useStore } from './store';

/**
 * Weekly check (on launch and when the app returns to the foreground) for newer
 * specifications of the broker catalog entry the user follows. Never updates
 * profiles silently: it only reports that an update is available.
 */
export function useCatalogUpdate(): CatalogEntry | null {
  const { settings, updateSettings } = useStore();
  const sub = settings.brokerCatalog;
  const [available, setAvailable] = useState<CatalogEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!navigator.onLine || !needsCheck(sub)) return;
      const r = await fetchCatalogIndex((u) => fetch(u, { cache: 'no-store' }));
      if (cancelled || !r.ok) return;
      await updateSettings({ brokerCatalog: { ...sub, lastCheckedAt: new Date().toISOString() } });
      setAvailable(updateAvailable(sub, r.value));
    };
    void check();
    const vis = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', vis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.entryId, sub.exportedAt]);

  // Hide once the user has imported the newer export.
  return available && sub.exportedAt && Date.parse(available.exportedAt) <= Date.parse(sub.exportedAt) ? null : available;
}
