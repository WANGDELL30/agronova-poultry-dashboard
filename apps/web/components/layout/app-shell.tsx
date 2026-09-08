'use client';

import type { ReactNode } from 'react';

import { DashboardHeader } from './dashboard-header';
import { MobileNavigation } from './mobile-navigation';
import { Sidebar } from './sidebar';

export function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-workspace">
        <DashboardHeader />
        <main className="dashboard-main">{children}</main>
      </div>
      <MobileNavigation />
    </div>
  );
}
