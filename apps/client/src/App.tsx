import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog, I18nContext, Toasts, makeI18n, useToasts } from '@tc/ui';
import { LANGS, defaultNumerals, localeTag, translate, type Lang } from '@tc/i18n';
import { resolveZone } from '@tc/sessions';
import { StoreProvider, useStore } from './state/store';
import { href, useRoute } from './state/router';
import { AppUiContext, type AppUi } from './components/AppContext';
import { Icon, type IconName } from './components/icons';
import { Dashboard } from './screens/Dashboard';
import { Calculators } from './screens/Calculators';
import { Instruments } from './screens/Instruments';
import { Sessions } from './screens/Sessions';
import { Journal } from './screens/Journal';
import { Analytics } from './screens/Analytics';
import { CalendarScreen } from './screens/Calendar';
import { SettingsScreen } from './screens/Settings';
import { useServiceWorker } from './state/pwa';
import { useCatalogUpdate } from './state/catalogUpdates';

const NAV: { id: string; icon: IconName; key: string; primary: boolean }[] = [
  { id: 'dashboard', icon: 'dashboard', key: 'nav.dashboard', primary: true },
  { id: 'calculators', icon: 'calculators', key: 'nav.calculators', primary: true },
  { id: 'journal', icon: 'journal', key: 'nav.journal', primary: true },
  { id: 'analytics', icon: 'analytics', key: 'nav.analytics', primary: true },
  { id: 'sessions', icon: 'sessions', key: 'nav.sessions', primary: false },
  { id: 'calendar', icon: 'calendar', key: 'nav.calendar', primary: false },
  { id: 'instruments', icon: 'instruments', key: 'nav.instruments', primary: false },
  { id: 'settings', icon: 'settings', key: 'nav.settings', primary: false },
];

function Shell() {
  const store = useStore();
  const { settings } = store;
  const route = useRoute();
  const lang = settings.language as Lang;
  const numerals = settings.numerals === 'auto' ? defaultNumerals(lang) : settings.numerals;
  const zone = resolveZone(settings.timeZone);
  const i18n = useMemo(() => makeI18n(lang, numerals, localeTag(lang, numerals), zone), [lang, numerals, zone]);
  const { toasts, push, dismiss } = useToasts();
  const [confirmState, setConfirmState] = useState<{ message: string; danger?: boolean; confirmLabel?: string; resolve: (v: boolean) => void } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const sw = useServiceWorker();
  const catalogUpdate = useCatalogUpdate();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = i18n.dir;
    root.style.setProperty('--font-scale', String(settings.fontScale));
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    document.title = `${translate(lang, 'app.name')} — ${translate(lang, 'app.tagline')}`;
  }, [lang, i18n.dir, settings.fontScale, settings.theme]);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  useEffect(() => setMoreOpen(false), [route]);

  const ui: AppUi = useMemo(
    () => ({
      toast: push,
      confirm: (message, opts) => new Promise<boolean>((resolve) => setConfirmState({ message, ...opts, resolve })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const t = i18n.t;
  const top = route[0] ?? 'dashboard';
  let screen: ReactNode;
  switch (top) {
    case 'calculators':
      screen = <Calculators tab={route[1]} />;
      break;
    case 'instruments':
      screen = <Instruments editId={route[1]} />;
      break;
    case 'sessions':
      screen = <Sessions />;
      break;
    case 'journal':
      screen = <Journal route={route.slice(1)} />;
      break;
    case 'analytics':
      screen = <Analytics />;
      break;
    case 'calendar':
      screen = <CalendarScreen />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
    default:
      screen = <Dashboard />;
  }

  const navItem = (n: (typeof NAV)[number], cls: string) => (
    <a key={n.id} href={href(n.id)} className={`${cls} ${top === n.id ? 'active' : ''}`} aria-current={top === n.id ? 'page' : undefined}>
      <Icon name={n.icon} />
      <span>{t(n.key)}</span>
    </a>
  );
  const secondaryActive = NAV.some((n) => !n.primary && n.id === top);

  return (
    <I18nContext.Provider value={i18n}>
      <AppUiContext.Provider value={ui}>
        <a className="skip" href="#main">
          {t('app.skipToContent')}
        </a>
        {!settings.disclaimerAccepted && <Onboarding />}
        <div className="layout">
          <aside className="sidebar">
            <div className="brand">
              <img src="./favicon.svg" alt="" width={32} height={32} />
              <div>
                <strong>{t('app.name')}</strong>
                <small>{t('app.tagline')}</small>
              </div>
            </div>
            <nav aria-label={t('nav.main')}>{NAV.map((n) => navItem(n, 'side-link'))}</nav>
          </aside>
          <main id="main" ref={mainRef} tabIndex={-1}>
            {!online && <div className="banner">{t('app.offline')}</div>}
            {sw.needRefresh && (
              <div className="banner update" role="status">
                <span>{t('app.updateReady')}</span>
                <button className="btn small primary" onClick={() => sw.update()}>
                  {t('app.updateNow')}
                </button>
                <button className="btn small" onClick={() => sw.dismiss()}>
                  {t('app.later')}
                </button>
              </div>
            )}
            {catalogUpdate && top !== 'instruments' && (
              <div className="banner update" role="status">
                <span>{t('cat.banner', { name: `${catalogUpdate.broker} ${catalogUpdate.accountType}`.trim() })}</span>
                <a className="btn small primary" href={href('instruments/catalog')}>
                  {t('cat.review')}
                </a>
              </div>
            )}
            {screen}
          </main>
        </div>
        <nav className="bottom-nav" aria-label={t('nav.main')}>
          {NAV.filter((n) => n.primary).map((n) => navItem(n, 'tab'))}
          <button type="button" className={`tab ${secondaryActive ? 'active' : ''}`} aria-expanded={moreOpen} aria-controls="more-sheet" onClick={() => setMoreOpen((v) => !v)}>
            <Icon name="more" />
            <span>{t('nav.more')}</span>
          </button>
        </nav>
        {moreOpen && (
          <div id="more-sheet" className="more-sheet" role="menu">
            {NAV.filter((n) => !n.primary).map((n) => (
              <a key={n.id} role="menuitem" href={href(n.id)} className="more-link">
                <Icon name={n.icon} />
                <span>{t(n.key)}</span>
              </a>
            ))}
          </div>
        )}
        <Toasts toasts={toasts} dismiss={dismiss} />
        <ConfirmDialog
          open={!!confirmState}
          message={confirmState?.message}
          danger={confirmState?.danger}
          confirmLabel={confirmState?.confirmLabel}
          onConfirm={() => {
            confirmState?.resolve(true);
            setConfirmState(null);
          }}
          onCancel={() => {
            confirmState?.resolve(false);
            setConfirmState(null);
          }}
        />
      </AppUiContext.Provider>
    </I18nContext.Provider>
  );
}

function Onboarding() {
  const { settings, updateSettings } = useStore();
  const lang = settings.language as Lang;
  const t = (k: string) => translate(lang, k);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="onboarding card" dir={lang === 'en' ? 'ltr' : 'rtl'} lang={lang}>
        <img src="./favicon.svg" alt="" width={56} height={56} />
        <h1 id="onb-title">{t('disclaimer.title')}</h1>
        <fieldset className="segmented">
          <legend>{t('onboarding.chooseLanguage')}</legend>
          <div className="seg-row">
            {LANGS.map((l) => (
              <label key={l.code} className={`seg ${lang === l.code ? 'on' : ''}`} lang={l.code}>
                <input type="radio" name="onb-lang" checked={lang === l.code} onChange={() => updateSettings({ language: l.code })} />
                <span>{l.native}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p>{t('disclaimer.body')}</p>
        <p className="notice warn">{t('disclaimer.local')}</p>
        <button className="btn primary block" onClick={() => updateSettings({ disclaimerAccepted: true })}>
          {t('disclaimer.accept')}
        </button>
      </div>
    </div>
  );
}

function bootLang(): Lang {
  const l = (navigator.language || 'en').slice(0, 2);
  return l === 'fa' || l === 'ar' ? l : 'en';
}

export function App() {
  const lang = bootLang();
  return (
    <StoreProvider
      fallback={<div className="boot">{translate(lang, 'app.loading')}</div>}
      onError={(code) => (
        <div className="boot error" role="alert">
          {translate(lang, code === 'quota' ? 'app.storageQuota' : 'app.storageError')}
        </div>
      )}
    >
      <Shell />
    </StoreProvider>
  );
}
