'use client';

import { CalibrationStatus } from '@agronova/telemetry-schema';
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';

import { useLanguage } from '../../lib/i18n/language-provider';
import { useTelemetry } from '../../lib/telemetry/telemetry-provider';
import type { DashboardSnapshot } from '../../lib/telemetry/types';
import { CalibrationBadge } from '../ui/status-badge';
import { operationsCopy } from './operations-copy';
import {
  ConnectionBanner,
  OperationsPage,
  OperationsPanel,
  OperationsStat,
} from './operations-shared';

function escapeCsv(value: string | number | null) {
  if (value === null) return '';
  const stringValue = String(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function createSnapshotCsv(snapshot: DashboardSnapshot) {
  const { telemetry } = snapshot;
  const headers = [
    'schema_version',
    'message_id',
    'device_id',
    'sequence_no',
    'captured_at',
    'received_at',
    'last_seen_at',
    'device_online',
    'air_temperature_raw_c',
    'air_temperature_filtered_c',
    'air_humidity_raw_pct',
    'air_humidity_filtered_pct',
    'water_temperature_raw_c',
    'water_temperature_filtered_c',
    'mq5_raw_adc',
    'mq5_filtered_adc',
    'mq5_adc_voltage_v',
    'mq5_relative_level_pct',
    'ammonia_adc',
    'water_flow_l_min',
    'water_total_l',
    'feed_weight_kg',
  ];
  const values: Array<string | number | null> = [
    telemetry.schema_version,
    telemetry.message_id,
    telemetry.device_id,
    telemetry.sequence_no,
    telemetry.captured_at,
    snapshot.received_at,
    snapshot.last_seen_at,
    String(snapshot.deviceOnline),
    telemetry.readings.air_temperature_c?.raw ?? null,
    telemetry.readings.air_temperature_c?.filtered ?? null,
    telemetry.readings.air_humidity_pct?.raw ?? null,
    telemetry.readings.air_humidity_pct?.filtered ?? null,
    telemetry.readings.water_temperature_c?.raw ?? null,
    telemetry.readings.water_temperature_c?.filtered ?? null,
    telemetry.readings.mq5?.raw_adc ?? null,
    telemetry.readings.mq5?.filtered_adc ?? null,
    telemetry.readings.mq5?.adc_voltage_v ?? null,
    telemetry.readings.mq5?.relative_level_pct ?? null,
    telemetry.readings.ammonia_adc,
    telemetry.readings.water_flow_l_min,
    telemetry.readings.water_total_l,
    telemetry.readings.feed_weight_kg,
  ];
  return `${headers.join(',')}\n${values.map(escapeCsv).join(',')}\n`;
}

function downloadSnapshot(snapshot: DashboardSnapshot, format: 'json' | 'csv') {
  const now = new Date().toISOString();
  const content =
    format === 'json'
      ? JSON.stringify(
          {
            exported_at: now,
            telemetry: snapshot.telemetry,
            received_at: snapshot.received_at,
            last_seen_at: snapshot.last_seen_at,
            device_online: snapshot.deviceOnline,
          },
          null,
          2,
        )
      : createSnapshotCsv(snapshot);
  const blob = new Blob([content], {
    type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `agronova-telemetry-${now.replaceAll(':', '-')}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CalibrationDashboard() {
  const { language } = useLanguage();
  const { state, retry } = useTelemetry();
  const copy = operationsCopy[language];
  const telemetry = state.kind === 'ready' ? state.snapshot.telemetry : null;
  const calibrations = telemetry
    ? [telemetry.calibration.dht22, telemetry.calibration.ds18b20, telemetry.calibration.mq5]
    : [];
  const rows = [
    ['DHT22', copy.calibration.methodDht, telemetry?.calibration.dht22],
    ['DS18B20', copy.calibration.methodWater, telemetry?.calibration.ds18b20],
    ['MQ-5', copy.calibration.methodMq5, telemetry?.calibration.mq5],
  ] as const;

  return (
    <OperationsPage {...copy.calibration}>
      <ConnectionBanner state={state} onRetry={retry} />
      <div className="operations-stats-grid">
        <OperationsStat
          icon={CheckCircle2}
          label={copy.calibration.calibrated}
          value={
            telemetry
              ? String(calibrations.filter((s) => s === CalibrationStatus.CALIBRATED).length)
              : '—'
          }
          detail={copy.calibration.supported}
          tone={
            calibrations.some((s) => s === CalibrationStatus.CALIBRATED) ? 'success' : 'default'
          }
        />
        <OperationsStat
          icon={FlaskConical}
          label={copy.calibration.inProgress}
          value={
            telemetry
              ? String(calibrations.filter((s) => s === CalibrationStatus.IN_PROGRESS).length)
              : '—'
          }
          detail={copy.calibration.supported}
        />
        <OperationsStat
          icon={Gauge}
          label={copy.calibration.uncalibrated}
          value={
            telemetry
              ? String(calibrations.filter((s) => s === CalibrationStatus.UNCALIBRATED).length)
              : '—'
          }
          detail={copy.calibration.supported}
          tone={
            calibrations.some((s) => s === CalibrationStatus.UNCALIBRATED) ? 'warning' : 'default'
          }
        />
        <OperationsStat
          icon={Database}
          label={copy.calibration.supported}
          value="3"
          detail="DHT22 · DS18B20 · MQ-5"
        />
      </div>

      <OperationsPanel
        title={copy.calibration.tableTitle}
        description={copy.calibration.tableDescription}
      >
        <div className="operations-table-wrap">
          <table className="operations-table">
            <thead>
              <tr>
                <th>{copy.calibration.sensor}</th>
                <th>{copy.calibration.method}</th>
                <th>{copy.common.status}</th>
                <th>{copy.calibration.action}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([sensor, method, status]) => (
                <tr key={sensor}>
                  <td>
                    <strong>{sensor}</strong>
                  </td>
                  <td>{method}</td>
                  <td>
                    {status ? (
                      <CalibrationBadge status={status} />
                    ) : (
                      <span className="table-waiting-label">{copy.common.pending}</span>
                    )}
                  </td>
                  <td>
                    <button type="button" className="table-action" disabled>
                      {copy.calibration.unavailableAction}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OperationsPanel>

      <aside className="operations-notice" role="note">
        <span aria-hidden="true">
          <ShieldCheck size={21} />
        </span>
        <div>
          <strong>{copy.calibration.mq5Title}</strong>
          <p>{copy.calibration.mq5Description}</p>
        </div>
      </aside>
    </OperationsPage>
  );
}

export function ExportDashboard() {
  const { language } = useLanguage();
  const { state, retry } = useTelemetry();
  const copy = operationsCopy[language];
  const snapshot = state.kind === 'ready' ? state.snapshot : null;
  const [format, setFormat] = useState<'json' | 'csv'>('json');

  return (
    <OperationsPage {...copy.exports}>
      <ConnectionBanner state={state} onRetry={retry} />
      <div className="operations-stats-grid">
        <OperationsStat
          icon={Database}
          label={copy.common.status}
          value={snapshot ? copy.exports.ready : copy.exports.unavailable}
          detail={snapshot?.telemetry.device_id ?? copy.common.waitingData}
          tone={snapshot ? 'success' : 'default'}
        />
        <OperationsStat
          icon={FileJson}
          label={copy.exports.formats}
          value="JSON"
          detail={copy.exports.jsonDescription}
        />
        <OperationsStat
          icon={FileSpreadsheet}
          label={copy.exports.formats}
          value="CSV"
          detail={copy.exports.csvDescription}
        />
        <OperationsStat
          icon={Clock3}
          label={copy.exports.timestamps}
          value="UTC"
          detail={copy.exports.utc}
        />
      </div>

      <OperationsPanel title={copy.exports.formTitle} description={copy.exports.formDescription}>
        <div className="export-form-grid">
          <fieldset>
            <legend>{copy.exports.scope}</legend>
            <label className="choice-card">
              <input type="radio" name="scope" defaultChecked />
              <span>
                <strong>{copy.exports.latestSnapshot}</strong>
                <small>{snapshot?.telemetry.device_id ?? copy.common.waitingData}</small>
              </span>
            </label>
            <label className="choice-card is-disabled">
              <input type="radio" name="scope" disabled />
              <span>
                <strong>{copy.exports.history}</strong>
                <small>{copy.common.pending}</small>
              </span>
            </label>
          </fieldset>

          <fieldset>
            <legend>{copy.exports.format}</legend>
            <label className="choice-card">
              <input
                type="radio"
                name="format"
                checked={format === 'json'}
                onChange={() => setFormat('json')}
              />
              <FileJson size={19} aria-hidden="true" />
              <span>
                <strong>JSON</strong>
                <small>{copy.exports.jsonDescription}</small>
              </span>
            </label>
            <label className="choice-card">
              <input
                type="radio"
                name="format"
                checked={format === 'csv'}
                onChange={() => setFormat('csv')}
              />
              <FileSpreadsheet size={19} aria-hidden="true" />
              <span>
                <strong>CSV</strong>
                <small>{copy.exports.csvDescription}</small>
              </span>
            </label>
          </fieldset>
        </div>

        <div className="export-actions">
          <p>{snapshot ? copy.exports.formDescription : copy.exports.waiting}</p>
          <button
            type="button"
            className="primary-button"
            disabled={!snapshot}
            onClick={() => snapshot && downloadSnapshot(snapshot, format)}
          >
            <Download size={16} aria-hidden="true" />
            {copy.exports.download} {format.toUpperCase()}
          </button>
        </div>
      </OperationsPanel>
    </OperationsPage>
  );
}

export function SettingsDashboard() {
  const { language } = useLanguage();
  const copy = operationsCopy[language];

  return (
    <OperationsPage {...copy.settings}>
      <div className="settings-grid">
        <OperationsPanel
          title={copy.settings.profileTitle}
          description={copy.settings.profileDescription}
        >
          <div className="settings-fields">
            <label>
              <span>{copy.settings.farm}</span>
              <input value="KKG Layer Farm" readOnly />
            </label>
            <label>
              <span>{copy.settings.house}</span>
              <input value={language === 'id' ? 'Kandang A' : 'House A'} readOnly />
            </label>
            <label>
              <span>{copy.settings.timezone}</span>
              <input value="Asia/Jakarta (WIB)" readOnly />
            </label>
          </div>
        </OperationsPanel>

        <OperationsPanel
          title={copy.settings.policyTitle}
          description={copy.settings.policyDescription}
        >
          <dl className="settings-policy-list">
            {[
              [copy.settings.schema, 'v1'],
              [copy.settings.nullPolicy, copy.settings.nullPolicyValue],
              [copy.settings.timestampPolicy, copy.settings.timestampPolicyValue],
              [copy.settings.devicePolicy, copy.settings.devicePolicyValue],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </OperationsPanel>

        <OperationsPanel
          className="settings-notifications"
          title={copy.settings.notificationsTitle}
          description={copy.settings.notificationsDescription}
        >
          <div className="settings-toggle-list">
            <label>
              <span>
                <BellRing size={18} aria-hidden="true" />
                {copy.settings.browserAlerts}
              </span>
              <input type="checkbox" disabled />
            </label>
            <label>
              <span>
                <SlidersHorizontal size={18} aria-hidden="true" />
                {copy.settings.emailDigest}
              </span>
              <input type="checkbox" disabled />
            </label>
          </div>
          <button type="button" className="secondary-button settings-save" disabled>
            <Settings size={16} aria-hidden="true" />
            {copy.settings.save}
          </button>
        </OperationsPanel>
      </div>
    </OperationsPage>
  );
}
