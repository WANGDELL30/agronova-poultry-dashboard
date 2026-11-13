'use client';

import type { ReactNode } from 'react';

import { useLanguage } from '../../lib/i18n/language-provider';
import { DashboardHeader } from './dashboard-header';
import { MobileNavigation } from './mobile-navigation';
import { Sidebar } from './sidebar';

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const { t } = useLanguage();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t('nav.skipToContent')}
      </a>
      <Sidebar />
      <div className="app-workspace">
        <DashboardHeader />
        <main id="main-content" className="dashboard-main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <MobileNavigation />
    </div>
  );
}
