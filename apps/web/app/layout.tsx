import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '../components/layout/app-shell';
import { AppProviders } from '../components/providers/app-providers';

import './styles.css';

export const metadata: Metadata = {
  title: 'AgroNova Poultry AI IoT',
  description: 'Environmental and operational monitoring for laying-hen farms.',
};

export const viewport: Viewport = {
  themeColor: '#1f7a4d',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
