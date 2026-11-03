import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/Home';
import { CalculatorsPage, CategoryPage, InvestmentsPage, WealthPage } from '@/pages/Browse';
import { FavoritesPage } from '@/pages/Favorites';
import { SettingsPage, SourcesPage } from '@/pages/Settings';
import { SettingsProvider, useSettings } from '@/lib/settings';
import { configureFormat } from '@/lib/format';

const SimRoute = lazy(() => import('@/pages/SimRoute'));

function FormatSync() {
  const { settings } = useSettings();
  configureFormat(settings.currency, settings.showCents);
  useEffect(() => {}, [settings.currency]);
  return null;
}

function Loading() {
  return <div className="flex h-[60vh] items-center justify-center"><div className="h-7 w-7 rounded-full border-2 border-accent border-t-transparent animate-spin" /></div>;
}

export default function App() {
  return (
    <SettingsProvider>
      <FormatSync />
      <HashRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="calculateurs" element={<CalculatorsPage />} />
              <Route path="calculateurs/:id" element={<CategoryPage />} />
              <Route path="investissements" element={<InvestmentsPage />} />
              <Route path="patrimoine" element={<WealthPage />} />
              <Route path="favoris" element={<FavoritesPage />} />
              <Route path="parametres" element={<SettingsPage />} />
              <Route path="sources" element={<SourcesPage />} />
              <Route path="sim/:id" element={<SimRoute />} />
              <Route path="*" element={<HomePage />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </SettingsProvider>
  );
}
