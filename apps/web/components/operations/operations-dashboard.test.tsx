import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageProvider } from '../../lib/i18n/language-provider';
import { TelemetryProvider } from '../../lib/telemetry/telemetry-provider';
import type { TelemetrySource } from '../../lib/telemetry/types';
import { OperationsDashboard } from './operations-dashboard';
import type { OperationsModule } from './operations-copy';

const waitingSource: TelemetrySource = {
  mode: 'api',
  scenario: null,
  async getInitialSnapshot() {
    return null;
  },
  subscribe() {
    return () => undefined;
  },
  start() {},
  stop() {},
  acknowledgeAlert() {},
};

function renderModule(module: OperationsModule) {
  return render(
    <LanguageProvider>
      <TelemetryProvider source={waitingSource}>
        <OperationsDashboard module={module} />
      </TelemetryProvider>
    </LanguageProvider>,
  );
}

describe('OperationsDashboard', () => {
  afterEach(() => cleanup());

  it.each([
    ['live', 'Pemantauan langsung kandang'],
    ['history', 'Analisis historis sensor'],
    ['alerts', 'Peringatan & peristiwa'],
    ['devices', 'Perangkat & sensor'],
    ['calibration', 'Kalibrasi sensor'],
    ['exports', 'Ekspor data'],
    ['settings', 'Pengaturan dashboard'],
  ] satisfies Array<[OperationsModule, string]>)(
    'renders a useful %s page',
    async (module, title) => {
      renderModule(module);

      expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
      expect(screen.queryByText(/belum tersedia pada fase/i)).toBeNull();
    },
  );

  it('keeps live sensor cards visible while waiting for hardware', async () => {
    renderModule('live');

    expect(await screen.findByText('Sensor langsung')).toBeTruthy();
    expect(screen.getAllByText('Menunggu sensor')).toHaveLength(7);
    expect(screen.getByText('Metadata telemetri terbaru')).toBeTruthy();
  });
});
