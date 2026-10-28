import { CalibrationDashboard, ExportDashboard, SettingsDashboard } from './management-modules';
import type { OperationsModule } from './operations-copy';
import {
  AlertsDashboard,
  DevicesDashboard,
  HistoricalAnalysisDashboard,
  LiveMonitoringDashboard,
} from './telemetry-modules';

export function OperationsDashboard({ module }: Readonly<{ module: OperationsModule }>) {
  switch (module) {
    case 'live':
      return <LiveMonitoringDashboard />;
    case 'history':
      return <HistoricalAnalysisDashboard />;
    case 'alerts':
      return <AlertsDashboard />;
    case 'devices':
      return <DevicesDashboard />;
    case 'calibration':
      return <CalibrationDashboard />;
    case 'exports':
      return <ExportDashboard />;
    case 'settings':
      return <SettingsDashboard />;
  }
}
