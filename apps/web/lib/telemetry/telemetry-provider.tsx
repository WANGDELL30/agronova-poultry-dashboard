'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { createTelemetrySource } from './create-telemetry-source';
import {
  TelemetrySourceError,
  type DataMode,
  type SimulationScenario,
  type TelemetrySource,
  type TelemetryState,
} from './types';

interface TelemetryContextValue {
  state: TelemetryState;
  mode: DataMode;
  scenario: SimulationScenario | null;
  acknowledgeAlert: (alertId: string) => void;
  retry: () => void;
}

const TelemetryContext = createContext<TelemetryContextValue | undefined>(undefined);

export function TelemetryProvider({
  children,
  source: providedSource,
}: Readonly<{ children: ReactNode; source?: TelemetrySource }>) {
  const source = useMemo(() => providedSource ?? createTelemetrySource(), [providedSource]);
  const [state, setState] = useState<TelemetryState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const snapshot = await source.getInitialSnapshot();
      setState(snapshot ? { kind: 'ready', snapshot } : { kind: 'empty' });
    } catch (error) {
      if (error instanceof TelemetrySourceError) {
        setState({ kind: error.kind, message: error.message });
        return;
      }

      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unknown telemetry source error.',
      });
    }
  }, [source]);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = source.subscribe((snapshot) => {
      if (mounted) {
        setState({ kind: 'ready', snapshot });
      }
    });

    source.start();
    void load();

    return () => {
      mounted = false;
      unsubscribe();
      source.stop();
    };
  }, [load, source]);

  const value = useMemo<TelemetryContextValue>(
    () => ({
      state,
      mode: source.mode,
      scenario: source.scenario,
      acknowledgeAlert: (alertId) => source.acknowledgeAlert(alertId),
      retry: () => void load(),
    }),
    [load, source, state],
  );

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}

export function useTelemetry(): TelemetryContextValue {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetry must be used within TelemetryProvider.');
  }

  return context;
}
