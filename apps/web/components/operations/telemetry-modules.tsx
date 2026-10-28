'use client';

import { CalibrationStatus, SensorQuality } from '@agronova/telemetry-schema';
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Droplets,
  Gauge,
  History,
  RadioTower,
  Thermometer,
  Waves,
  Weight,
  Wind,
  Wifi,
  type LucideIcon,
} from 'lucide-react';

import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelativeTime,
} from '../../lib/formatting/formatters';
import { useLanguage } from '../../lib/i18n/language-provider';
import { useTelemetry } from '../../lib/telemetry/telemetry-provider';
import type { TrendPoint } from '../../lib/telemetry/types';
import { AlertPanel } from '../dashboard/alert-panel';
import { DeviceHealthCard } from '../dashboard/device-health-card';
import { TrendChart } from '../dashboard/trend-chart';
import { CalibrationBadge, StatusBadge } from '../ui/status-badge';
import { operationsCopy } from './operations-copy';
import {
  ConnectionBanner,
  OperationsPage,
  OperationsPanel,
  OperationsStat,
  WaitingRow,
} from './operations-shared';

interface LiveSensorModel {
  id: string;
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  quality: SensorQuality;
}

function displayTrendValue(
  point: TrendPoint,
  key: 'air_temperature_c' | 'air_humidity_pct' | 'water_temperature_c',
  locale: string,
  unit: string,
) {
  const reading = point[key];
  return reading ? `${formatNumber(reading.filtered, locale)} ${unit}` : '—';
}

export function LiveMonitoringDashboard() {
  const { language, locale, t } = useLanguage();
  const { state, retry } = useTelemetry();
  const copy = operationsCopy[language];
  const snapshot = state.kind === 'ready' ? state.snapshot : null;
  const telemetry = snapshot?.telemetry;
  const waiting = copy.common.waitingSensor;

  const sensors: LiveSensorModel[] = [
    {
      id: 'air-temperature',
      icon: Thermometer,
      label: t('sensor.airTemperature'),
      value: telemetry?.readings.air_temperature_c
        ? `${formatNumber(telemetry.readings.air_temperature_c.filtered, locale)} °C`
        : waiting,
      detail: telemetry?.readings.air_temperature_c
        ? `${t('sensor.raw')}: ${formatNumber(telemetry.readings.air_temperature_c.raw, locale)} °C`
        : t('sensor.waitingDescription'),
      quality: telemetry?.quality.air_temperature ?? SensorQuality.UNKNOWN,
    },
    {
      id: 'air-humidity',
      icon: Droplets,
      label: t('sensor.airHumidity'),
      value: telemetry?.readings.air_humidity_pct
        ? `${formatNumber(telemetry.readings.air_humidity_pct.filtered, locale)}%`
        : waiting,
      detail: telemetry?.readings.air_humidity_pct
        ? `${t('sensor.raw')}: ${formatNumber(telemetry.readings.air_humidity_pct.raw, locale)}%`
        : t('sensor.waitingDescription'),
      quality: telemetry?.quality.air_humidity ?? SensorQuality.UNKNOWN,
    },
    {
      id: 'water-temperature',
      icon: Waves,
      label: t('sensor.waterTemperature'),
      value: telemetry?.readings.water_temperature_c
        ? `${formatNumber(telemetry.readings.water_temperature_c.filtered, locale)} °C`
        : waiting,
      detail: telemetry?.readings.water_temperature_c
        ? `${t('sensor.raw')}: ${formatNumber(telemetry.readings.water_temperature_c.raw, locale)} °C`
        : t('sensor.waitingDescription'),
      quality: telemetry?.quality.water_temperature ?? SensorQuality.UNKNOWN,
    },
    {
      id: 'mq5',
      icon: Gauge,
      label: t('sensor.mq5'),
      value: telemetry?.readings.mq5
        ? `${formatNumber(telemetry.readings.mq5.relative_level_pct, locale)}% rel.`
        : waiting,
      detail: telemetry?.readings.mq5
        ? `${telemetry.readings.mq5.raw_adc} ADC · ${telemetry.readings.mq5.filtered_adc} ADC · ${formatNumber(telemetry.readings.mq5.adc_voltage_v, locale, 2)} V`
        : t('sensor.mq5Info'),
      quality: telemetry?.quality.mq5 ?? SensorQuality.UNKNOWN,
    },
    {
      id: 'ammonia',
      icon: Wind,
      label: t('sensor.ammonia'),
      value:
        telemetry?.readings.ammonia_adc === null || telemetry?.readings.ammonia_adc === undefined
          ? waiting
          : `${telemetry.readings.ammonia_adc} ADC`,
      detail:
        telemetry?.readings.ammonia_adc === null || telemetry?.readings.ammonia_adc === undefined
          ? t('sensor.ammoniaHardware')
          : t('sensor.rawAdc'),
      quality: telemetry?.quality.ammonia ?? SensorQuality.UNKNOWN,
    },
    {
      id: 'water-flow',
      icon: Droplets,
      label: t('sensor.waterConsumption'),
      value:
        telemetry?.readings.water_flow_l_min === null ||
        telemetry?.readings.water_flow_l_min === undefined
          ? waiting
          : `${formatNumber(telemetry.readings.water_flow_l_min, locale, 2)} L/min`,
      detail:
        telemetry?.readings.water_total_l === null ||
        telemetry?.readings.water_total_l === undefined
          ? t('sensor.waterHardware')
          : `${formatNumber(telemetry.readings.water_total_l, locale, 2)} L total`,
      quality: telemetry?.quality.water_flow ?? SensorQuality.UNKNOWN,
    },
    {
      id: 'feed-weight',
      icon: Weight,
      label: t('sensor.feedWeight'),
      value:
        telemetry?.readings.feed_weight_kg === null ||
        telemetry?.readings.feed_weight_kg === undefined
          ? waiting
          : `${formatNumber(telemetry.readings.feed_weight_kg, locale, 2)} kg`,
      detail:
        telemetry?.readings.feed_weight_kg === null ||
        telemetry?.readings.feed_weight_kg === undefined
          ? t('sensor.feedHardware')
          : copy.common.currentReading,
      quality: telemetry?.quality.feed_weight ?? SensorQuality.UNKNOWN,
    },
  ];

  return (
    <OperationsPage {...copy.live}>
      <ConnectionBanner state={state} onRetry={retry} />
      <div className="operations-stats-grid">
        <OperationsStat
          icon={RadioTower}
          label={copy.common.connection}
          value={snapshot?.deviceOnline ? copy.common.active : copy.common.pending}
          detail={snapshot ? snapshot.telemetry.device_id : copy.common.waitingDescription}
          tone={snapshot?.deviceOnline ? 'success' : 'default'}
        />
        <OperationsStat
          icon={Cpu}
          label={copy.common.device}
          value={telemetry?.device_id ?? '—'}
          detail={telemetry?.device.firmware_version ?? copy.common.waitingData}
        />
        <OperationsStat
          icon={CheckCircle2}
          label={copy.common.dataQuality}
          value={telemetry ? t(`status.${telemetry.quality.overall}`) : t('status.UNKNOWN')}
          detail={telemetry ? `Schema v${telemetry.schema_version}` : copy.common.waitingData}
          tone={telemetry?.quality.overall === SensorQuality.VALID ? 'success' : 'default'}
        />
        <OperationsStat
          icon={Clock3}
          label={copy.common.latestUpdate}
          value={snapshot ? formatRelativeTime(snapshot.received_at, locale) : '—'}
          detail={snapshot ? formatDateTime(snapshot.received_at, locale) : copy.common.waitingData}
        />
      </div>

      <OperationsPanel title={copy.live.sensorsTitle} description={copy.live.sensorsDescription}>
        <div className="live-sensor-grid">
          {sensors.map(({ id, icon: Icon, label, value, detail, quality }) => (
            <article className="live-sensor-tile" key={id}>
              <div className="live-sensor-heading">
                <span aria-hidden="true">
                  <Icon size={19} />
                </span>
                <h3>{label}</h3>
                <StatusBadge status={quality} />
              </div>
              <strong className={value === waiting ? 'is-waiting' : undefined}>{value}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </OperationsPanel>

      <OperationsPanel title={copy.live.metadataTitle} description={copy.live.metadataDescription}>
        <dl className="operations-detail-grid">
          {[
            [copy.live.schema, telemetry ? `v${telemetry.schema_version}` : '—'],
            [copy.live.message, telemetry?.message_id ?? '—'],
            [copy.live.sequence, telemetry ? String(telemetry.sequence_no) : '—'],
            [copy.live.captured, telemetry ? formatDateTime(telemetry.captured_at, locale) : '—'],
            [copy.live.received, snapshot ? formatDateTime(snapshot.received_at, locale) : '—'],
            [copy.live.lastSeen, snapshot ? formatDateTime(snapshot.last_seen_at, locale) : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </OperationsPanel>
    </OperationsPage>
  );
}

export function HistoricalAnalysisDashboard() {
  const { language, locale, t } = useLanguage();
  const { state, retry } = useTelemetry();
  const copy = operationsCopy[language];
  const history = state.kind === 'ready' ? state.snapshot.history : [];
  const first = history.at(0);
  const last = history.at(-1);
  const durationSeconds =
    first && last
      ? Math.max(
          0,
          (new Date(last.captured_at).getTime() - new Date(first.captured_at).getTime()) / 1000,
        )
      : null;

  return (
    <OperationsPage {...copy.history}>
      <ConnectionBanner state={state} onRetry={retry} />
      <div className="operations-stats-grid">
        <OperationsStat
          icon={Database}
          label={copy.common.records}
          value={history.length ? new Intl.NumberFormat(locale).format(history.length) : '—'}
          detail={history.length ? copy.common.active : copy.common.noRecords}
        />
        <OperationsStat
          icon={History}
          label={copy.history.oldest}
          value={first ? formatRelativeTime(first.captured_at, locale) : '—'}
          detail={first ? formatDateTime(first.captured_at, locale) : copy.common.waitingData}
        />
        <OperationsStat
          icon={Clock3}
          label={copy.history.newest}
          value={last ? formatRelativeTime(last.captured_at, locale) : '—'}
          detail={last ? formatDateTime(last.captured_at, locale) : copy.common.waitingData}
        />
        <OperationsStat
          icon={RadioTower}
          label={copy.history.duration}
          value={durationSeconds === null ? '—' : formatDuration(durationSeconds, locale)}
          detail={history.length ? copy.common.records : copy.common.waitingData}
        />
      </div>

      <TrendChart history={history} />

      <OperationsPanel title={copy.history.tableTitle} description={copy.history.tableDescription}>
        <div className="operations-table-wrap">
          <table className="operations-table">
            <thead>
              <tr>
                <th>{copy.history.captured}</th>
                <th>{t('sensor.airTemperature')}</th>
                <th>{t('sensor.airHumidity')}</th>
                <th>{t('sensor.waterTemperature')}</th>
                <th>{t('sensor.mq5')}</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td className="operations-table-empty" colSpan={5}>
                    {copy.common.noRecords}
                  </td>
                </tr>
              ) : (
                history
                  .slice(-8)
                  .reverse()
                  .map((point) => (
                    <tr key={point.captured_at}>
                      <td>{formatDateTime(point.captured_at, locale)}</td>
                      <td>{displayTrendValue(point, 'air_temperature_c', locale, '°C')}</td>
                      <td>{displayTrendValue(point, 'air_humidity_pct', locale, '%')}</td>
                      <td>{displayTrendValue(point, 'water_temperature_c', locale, '°C')}</td>
                      <td>
                        {point.mq5_relative_level_pct
                          ? `${formatNumber(point.mq5_relative_level_pct.filtered, locale)}% rel.`
                          : '—'}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </OperationsPanel>
    </OperationsPage>
  );
}

export function AlertsDashboard() {
  const { language } = useLanguage();
  const { state, retry, acknowledgeAlert } = useTelemetry();
  const copy = operationsCopy[language];
  const alerts = state.kind === 'ready' ? state.snapshot.alerts : [];
  const active = alerts.filter((alert) => !alert.acknowledged).length;
  const acknowledged = alerts.length - active;
  const warnings = alerts.filter((alert) => alert.severity === 'warning').length;
  const information = alerts.filter((alert) => alert.severity === 'information').length;

  return (
    <OperationsPage {...copy.alerts}>
      <ConnectionBanner state={state} onRetry={retry} />
      <div className="operations-stats-grid">
        <OperationsStat
          icon={BellRing}
          label={copy.alerts.activeAlerts}
          value={state.kind === 'ready' ? String(active) : '—'}
          detail={state.kind === 'ready' ? copy.common.active : copy.common.waitingData}
          tone={active > 0 ? 'warning' : 'default'}
        />
        <OperationsStat
          icon={CheckCircle2}
          label={copy.alerts.acknowledged}
          value={state.kind === 'ready' ? String(acknowledged) : '—'}
          detail={copy.common.status}
        />
        <OperationsStat
          icon={Gauge}
          label={copy.alerts.warnings}
          value={state.kind === 'ready' ? String(warnings) : '—'}
          detail={copy.common.records}
        />
        <OperationsStat
          icon={Database}
          label={copy.alerts.information}
          value={state.kind === 'ready' ? String(information) : '—'}
          detail={copy.common.records}
        />
      </div>

      {state.kind === 'ready' ? (
        <AlertPanel alerts={alerts} onAcknowledge={acknowledgeAlert} />
      ) : (
        <OperationsPanel
          title={copy.alerts.waitingTitle}
          description={copy.alerts.waitingDescription}
        >
          <WaitingRow
            title={copy.alerts.waitingTitle}
            description={copy.alerts.waitingDescription}
          />
        </OperationsPanel>
      )}

      <OperationsPanel title={copy.alerts.rulesTitle} description={copy.alerts.rulesDescription}>
        <div className="operations-rule-list">
          {[copy.alerts.ruleHumidity, copy.alerts.ruleOffline, copy.alerts.ruleCalibration].map(
            (rule) => (
              <div key={rule}>
                <span aria-hidden="true" />
                <strong>{rule}</strong>
                <small>{state.kind === 'ready' ? copy.common.active : copy.common.pending}</small>
              </div>
            ),
          )}
        </div>
      </OperationsPanel>
    </OperationsPage>
  );
}

export function DevicesDashboard() {
  const { language, t } = useLanguage();
  const { state, retry } = useTelemetry();
  const copy = operationsCopy[language];
  const snapshot = state.kind === 'ready' ? state.snapshot : null;
  const telemetry = snapshot?.telemetry;
  const inventory = [
    [t('sensor.airTemperature'), telemetry?.quality.air_temperature, telemetry?.calibration.dht22],
    [t('sensor.airHumidity'), telemetry?.quality.air_humidity, telemetry?.calibration.dht22],
    [
      t('sensor.waterTemperature'),
      telemetry?.quality.water_temperature,
      telemetry?.calibration.ds18b20,
    ],
    [t('sensor.mq5'), telemetry?.quality.mq5, telemetry?.calibration.mq5],
    [t('sensor.ammonia'), telemetry?.quality.ammonia, CalibrationStatus.NOT_REQUIRED],
    [t('sensor.waterConsumption'), telemetry?.quality.water_flow, CalibrationStatus.NOT_REQUIRED],
    [t('sensor.feedWeight'), telemetry?.quality.feed_weight, CalibrationStatus.NOT_REQUIRED],
  ] as const;

  return (
    <OperationsPage {...copy.devices}>
      <ConnectionBanner state={state} onRetry={retry} />
      <div className="operations-stats-grid">
        <OperationsStat
          icon={Wifi}
          label={copy.devices.online}
          value={snapshot ? (snapshot.deviceOnline ? '1/1' : '0/1') : '—'}
          detail={snapshot ? telemetry!.device_id : copy.common.waitingData}
          tone={snapshot?.deviceOnline ? 'success' : 'default'}
        />
        <OperationsStat
          icon={Cpu}
          label={copy.devices.installed}
          value={snapshot ? `${snapshot.installedSensorCount}/7` : '—'}
          detail={copy.devices.inventoryTitle}
        />
        <OperationsStat
          icon={RadioTower}
          label={copy.devices.disconnected}
          value={snapshot ? String(snapshot.disconnectedSensorCount) : '—'}
          detail={copy.common.status}
          tone={snapshot?.disconnectedSensorCount ? 'warning' : 'default'}
        />
        <OperationsStat
          icon={Database}
          label={copy.devices.firmware}
          value={telemetry?.device.firmware_version ?? '—'}
          detail={telemetry?.device_id ?? copy.common.waitingData}
        />
      </div>

      {snapshot ? (
        <DeviceHealthCard snapshot={snapshot} />
      ) : (
        <OperationsPanel
          title={copy.devices.waitingTitle}
          description={copy.devices.waitingDescription}
        >
          <WaitingRow
            icon={Cpu}
            title={copy.devices.waitingTitle}
            description={copy.devices.waitingDescription}
          />
        </OperationsPanel>
      )}

      <OperationsPanel
        title={copy.devices.inventoryTitle}
        description={copy.devices.inventoryDescription}
      >
        <div className="operations-table-wrap">
          <table className="operations-table">
            <thead>
              <tr>
                <th>{copy.devices.sensor}</th>
                <th>{copy.common.status}</th>
                <th>{copy.devices.calibration}</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map(([sensor, quality, calibration]) => (
                <tr key={sensor}>
                  <td>{sensor}</td>
                  <td>
                    <StatusBadge status={quality ?? SensorQuality.UNKNOWN} />
                  </td>
                  <td>
                    {telemetry ? (
                      <CalibrationBadge status={calibration ?? CalibrationStatus.NOT_REQUIRED} />
                    ) : (
                      <span className="table-waiting-label">{copy.common.pending}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OperationsPanel>
    </OperationsPage>
  );
}
