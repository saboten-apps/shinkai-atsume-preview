import React, { lazy, Suspense, useEffect, useState } from 'react';
import rawFishCatalog from '../data/fish.json';
import { APP_CONFIG, type Locale } from './config/appConfig';
import { getAppName, getMessages, getOrganizationName } from './lib/i18n';
import { AboutPage } from './pages/AboutPage';
import { FishDetailPage } from './pages/FishDetailPage';
import { PokedexPage } from './pages/PokedexPage';
import { TodayGachaPage } from './pages/TodayGachaPage';
import {
  loadCollectionState,
  loadLocalePreference,
  mergeBackupJson,
  recordDailyDrawInState,
  saveCollectionState,
  saveLocalePreference,
} from './services/storageService';
import { recordTelemetryEvent } from './services/telemetryService';
import type { FishCatalogData } from './types/schema';

const ExplorationPage = lazy(() => import('./features/exploration/ExplorationPage'));

type RouteState =
  | { page: 'explore'; date: string }
  | { page: 'today' }
  | { page: 'pokedex' }
  | { page: 'about' }
  | { page: 'detail'; fishId: string };

function parseHashRoute(hash: string): RouteState {
  const cleaned = hash.replace(/^#\/?/, '').trim();
  if (!cleaned || cleaned === 'today') {
    return { page: 'today' };
  }
  if (/^explore\/\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return { page: 'explore', date: cleaned.slice(8) };
  }
  if (cleaned === 'pokedex') {
    return { page: 'pokedex' };
  }
  if (cleaned === 'about') {
    return { page: 'about' };
  }
  if (cleaned.startsWith('fish/')) {
    const fishId = cleaned.slice('fish/'.length).trim();
    if (fishId) {
      return { page: 'detail', fishId };
    }
  }
  return { page: 'today' };
}

const catalogData = rawFishCatalog as unknown as FishCatalogData;

export const App: React.FC = () => {
  const [locale, setLocale] = useState<Locale>(() => loadLocalePreference());
  const [{ state: collectionState, storageAvailable }, setStorageBundle] = useState(() =>
    loadCollectionState()
  );
  const [saveError, setSaveError] = useState(!storageAvailable);
  const [route, setRoute] = useState<RouteState>(() =>
    parseHashRoute(typeof window !== 'undefined' ? window.location.hash : '')
  );

  const t = getMessages(locale);

  useEffect(() => {
    const onHashChange = () => {
      const nextRoute = parseHashRoute(window.location.hash);
      setRoute(nextRoute);
      recordTelemetryEvent({
        eventType: 'page_view',
        screen: nextRoute.page,
        fishId: nextRoute.page === 'detail' ? nextRoute.fishId : undefined,
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // 他タブでガチャが引かれた場合も同期する（設計書 60行目）
  useEffect(() => {
    const onStorageChange = () => {
      const loaded = loadCollectionState();
      setStorageBundle(loaded);
    };
    window.addEventListener('storage', onStorageChange);
    return () => window.removeEventListener('storage', onStorageChange);
  }, []);

  const navigateTo = (hashPath: string) => {
    if (typeof window !== 'undefined') {
      window.location.hash = hashPath;
    }
    setRoute(parseHashRoute(hashPath));
  };

  const handleToggleLocale = () => {
    const nextLocale: Locale = locale === 'ja' ? 'en' : 'ja';
    setLocale(nextLocale);
    saveLocalePreference(nextLocale);
  };

  const handleRecordDraw = (jstDate: string, fishId: string) => {
    const { nextState, alreadyDrawnToday, wasNewDiscovery } = recordDailyDrawInState(
      collectionState,
      {
        jstDate,
        fishId,
        lotteryVersion: APP_CONFIG.lottery.version,
      }
    );
    setStorageBundle({ state: nextState, storageAvailable });
    const savedOk = saveCollectionState(nextState);
    if (!savedOk) {
      setSaveError(true);
    }
    return { alreadyDrawnToday, wasNewDiscovery };
  };

  const handleRestoreBackup = (jsonText: string): { ok: boolean; error?: string } => {
    const merged = mergeBackupJson(collectionState, jsonText);
    if (!merged.ok) {
      return { ok: false, error: merged.error };
    }
    setStorageBundle({ state: merged.mergedState, storageAvailable });
    const savedOk = saveCollectionState(merged.mergedState);
    if (!savedOk) {
      setSaveError(true);
    }
    return { ok: true };
  };

  return (
    <div className="app-shell">
      {/* ヘッダー */}
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-group" onClick={() => navigateTo('#/today')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigateTo('#/today')}>
            <div className="brand-title-row">
              <h1 className="brand-title">{getAppName(locale, false)}</h1>
              {t.common.tentativeBadge && (
                <span className="tentative-badge">{t.common.tentativeBadge}</span>
              )}
            </div>
            <p className="brand-org">{getOrganizationName(locale)}</p>
          </div>

          <div className="header-controls">
            <nav className="main-nav" aria-label="Main Navigation">
              <button
                type="button"
                className={`nav-tab ${route.page === 'today' ? 'is-active' : ''}`}
                onClick={() => navigateTo('#/today')}
              >
                {t.nav.today}
              </button>
              <button
                type="button"
                className={`nav-tab ${route.page === 'pokedex' ? 'is-active' : ''}`}
                onClick={() => navigateTo('#/pokedex')}
              >
                {t.nav.pokedex}
              </button>
              <button
                type="button"
                className={`nav-tab ${route.page === 'about' ? 'is-active' : ''}`}
                onClick={() => navigateTo('#/about')}
              >
                {t.nav.about}
              </button>
            </nav>

            <button
              type="button"
              className="lang-toggle-btn"
              onClick={handleToggleLocale}
              aria-label="Toggle Language (Japanese / English)"
            >
              <span>{t.nav.langCurrent}</span>
              <span className="lang-switch-sep" aria-hidden="true">/</span>
              <strong>{t.nav.langSwitchLabel}</strong>
            </button>
          </div>
        </div>
      </header>

      {/* 保存不可環境での警告バナー（設計書 86行目） */}
      {saveError && (
        <div className="storage-warning-banner" role="alert">
          {t.common.storageWarning}
        </div>
      )}

      {/* メインコンテンツ */}
      <main className="app-main">
        {route.page === 'today' && (
          <TodayGachaPage
            locale={locale}
            fishList={catalogData.fish}
            collectionState={collectionState}
            onRecordDraw={handleRecordDraw}
            onNavigateToFish={(fishId) => navigateTo(`#/fish/${fishId}`)}
            onNavigateToPokedex={() => navigateTo('#/pokedex')}
            onExplore={(date) => navigateTo(`#/explore/${date}`)}
          />
        )}

        {route.page === 'explore' && (
          <Suspense fallback={<p className="page-container">探索を準備しています… / Preparing exploration…</p>}>
            <ExplorationPage locale={locale} date={route.date}
              fish={catalogData.fish.find(f => f.id === collectionState.dailyHistory[route.date]?.fishId)}
              onBack={() => navigateTo('#/today')} />
          </Suspense>
        )}

        {route.page === 'pokedex' && (
          <PokedexPage
            locale={locale}
            fishList={catalogData.fish}
            collectionState={collectionState}
            onSelectFish={(fishId) => navigateTo(`#/fish/${fishId}`)}
            onRestoreBackup={handleRestoreBackup}
          />
        )}

        {route.page === 'detail' && (
          <FishDetailPage
            fishId={route.fishId}
            locale={locale}
            fishList={catalogData.fish}
            collectionState={collectionState}
            onBackToPokedex={() => navigateTo('#/pokedex')}
            onBackToToday={() => navigateTo('#/today')}
          />
        )}

        {route.page === 'about' && (
          <AboutPage locale={locale} onBackToToday={() => navigateTo('#/today')} />
        )}
      </main>

      {/* フッター */}
      <footer className="app-footer">
        <div className="footer-inner">
          <p className="footer-disclaimer">{t.card.cardDisclaimer}</p>
          <p className="footer-brand">
            {getAppName(locale, true)} — {getOrganizationName(locale)}
          </p>
        </div>
      </footer>
    </div>
  );
};
