'use client';

import type { ReactNode } from 'react';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { TelemetryProvider } from '../../lib/telemetry/telemetry-provider';

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <LanguageProvider>
      <TelemetryProvider>{children}</TelemetryProvider>
    </LanguageProvider>
  );
}
