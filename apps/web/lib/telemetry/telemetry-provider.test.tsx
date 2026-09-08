import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MockTelemetrySource } from './mock-telemetry-source';
import { TelemetryProvider, useTelemetry } from './telemetry-provider';

function TelemetryProbe() {
  const { state } = useTelemetry();
  return <span>{state.kind}</span>;
}

describe('TelemetryProvider', () => {
  afterEach(() => {
    cleanup();
  });

  it('loads a source and stops it when the provider unmounts', async () => {
    const source = new MockTelemetrySource({ initialDelayMs: 0, intervalMs: 60_000 });
    const start = vi.spyOn(source, 'start');
    const stop = vi.spyOn(source, 'stop');
    const view = render(
      <TelemetryProvider source={source}>
        <TelemetryProbe />
      </TelemetryProvider>,
    );

    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
    expect(start).toHaveBeenCalledOnce();

    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
});
