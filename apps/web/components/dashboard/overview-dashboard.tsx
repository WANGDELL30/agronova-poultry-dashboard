'use client';

import {
  BellRing,
  CheckCircle2,
  Clock3,
  Cpu,
  Droplets,
  FlaskConical,
  Gauge,
  Thermometer,
  Waves,
  Weight,
  Wind,
} from 'lucide-react';

import { formatNumber, formatRelativeTime } from '../../lib/formatting/formatters';
import { useLanguage } from '../../lib/i18n/language-provider';
import { useTelemetry } from '../../lib/telemetry/telemetry-provider';
import { EmptyState, ErrorState, LoadingSkeleton } from '../ui/data-states';
import { SectionHeader } from '../ui/section-header';
import { AlertPanel } from './alert-panel';
import { DeviceHealthCard } from './device-health-card';
import { SensorCard, SensorUnavailableCard } from './sensor-card';
import { SummaryCard } from './summary-card';
import { TrendChart } from './trend-chart';

export function OverviewDashboard() {
  const { locale, t } = useLanguage();
  const { state, acknowledgeAlert, retry } = useTelemetry();

  if (state.kind === 'loading') {
    return <LoadingSkeleton />;
  }

  if (state.kind === 'unavailable' || state.kind === 'error') {
    return (
      <ErrorState
        unavailable={state.kind === 'unavailable'}
        detail={state.message}
        onRetry={retry}
      />
    );
  }

  if (state.kind === 'empty') {
    return <EmptyState />;
  }

  const { snapshot } = state;
  const { telemetry } = snapshot;
  const airTemperature = telemetry.readings.air_temperature_c;
  const airHumidity = telemetry.readings.air_humidity_pct;
  const waterTemperature = telemetry.readings.water_temperature_c;
  const mq5 = telemetry.readings.mq5;
  const offline = !snapshot.deviceOnline;
  const activeAlerts = snapshot.alerts.filter((alert) => !alert.acknowledged).length;

  return (
    <div className="overview-page">
      <section className="overview-intro">
        <p className="section-eyebrow">{t('overview.eyebrow')}</p>
        <h2>{t('overview.title')}</h2>
        <p>{t('overview.description')}</p>
      </section>

      <section aria-labelledby="summary-heading">
        <h2 className="sr-only" id="summary-heading">
          {t('overview.summary')}
        </h2>
        <div className="summary-grid">
          <SummaryCard
            icon={Cpu}
            label={t('summary.devicesOnline')}
            value={snapshot.deviceOnline ? '1/1' : '0/1'}
            detail={t('summary.ofDevices', {
              online: snapshot.deviceOnline ? 1 : 0,
              total: 1,
            })}
            tone={snapshot.deviceOnline ? 'success' : 'warning'}
          />
          <SummaryCard
            icon={BellRing}
            label={t('summary.activeAlerts')}
            value={String(activeAlerts)}
            detail={t('summary.requiresAttention', { count: activeAlerts })}
            tone={activeAlerts > 0 ? 'warning' : 'success'}
          />
          <SummaryCard
            icon={CheckCircle2}
            label={t('summary.dataQuality')}
            value={t(`status.${telemetry.quality.overall}`)}
            detail={t('summary.schemaValidated')}
            tone={telemetry.quality.overall === 'VALID' ? 'success' : 'warning'}
          />
          <SummaryCard
            icon={Clock3}
            label={t('summary.lastTelemetry')}
            value={formatRelativeTime(snapshot.received_at, locale)}
            detail={t('summary.receivedAt', {
              time: new Intl.DateTimeFormat(locale, {
                timeZone: 'Asia/Jakarta',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              }).format(new Date(snapshot.received_at)),
            })}
            tone={snapshot.deviceOnline ? 'default' : 'warning'}
          />
        </div>
      </section>

      <section className="sensor-section" aria-labelledby="sensor-heading">
        <SectionHeader
          titleId="sensor-heading"
          title={t('overview.sensors')}
          description={t('overview.sensorsDescription')}
        />
        <div className="sensor-grid">
          {airTemperature && (
            <SensorCard
              icon={Thermometer}
              titleKey="sensor.airTemperature"
              value={airTemperature.filtered}
              unit="°C"
              details={[
                {
                  labelKey: 'sensor.raw',
                  value: `${formatNumber(airTemperature.raw, locale)} °C`,
                },
              ]}
              quality={telemetry.quality.air_temperature}
              calibration={telemetry.calibration.dht22}
              receivedAt={snapshot.received_at}
              trend="rising"
              relativeStatus={offline ? 'offline' : 'normal'}
            />
          )}

          {airHumidity && (
            <SensorCard
              icon={Droplets}
              titleKey="sensor.airHumidity"
              value={airHumidity.filtered}
              unit="%"
              details={[
                {
                  labelKey: 'sensor.raw',
                  value: `${formatNumber(airHumidity.raw, locale)}%`,
                },
              ]}
              quality={telemetry.quality.air_humidity}
              calibration={telemetry.calibration.dht22}
              receivedAt={snapshot.received_at}
              trend="stable"
              relativeStatus={
                offline ? 'offline' : airHumidity.filtered >= 70 ? 'warning' : 'normal'
              }
            />
          )}

          {waterTemperature ? (
            <SensorCard
              icon={Waves}
              titleKey="sensor.waterTemperature"
              value={waterTemperature.filtered}
              unit="°C"
              details={[
                {
                  labelKey: 'sensor.raw',
                  value: `${formatNumber(waterTemperature.raw, locale)} °C`,
                },
              ]}
              quality={telemetry.quality.water_temperature}
              calibration={telemetry.calibration.ds18b20}
              receivedAt={snapshot.received_at}
              trend="stable"
              relativeStatus={offline ? 'offline' : 'normal'}
            />
          ) : (
            <SensorUnavailableCard
              icon={Waves}
              titleKey="sensor.waterTemperature"
              descriptionKey="sensor.waterTemperatureHardware"
            />
          )}

          {mq5 && (
            <SensorCard
              icon={Gauge}
              titleKey="sensor.mq5"
              value={mq5.relative_level_pct}
              unit="% rel."
              primaryLabelKey="sensor.relativeLevel"
              details={[
                { labelKey: 'sensor.rawAdc', value: `${mq5.raw_adc} ADC` },
                { labelKey: 'sensor.filteredAdc', value: `${mq5.filtered_adc} ADC` },
                {
                  labelKey: 'sensor.voltage',
                  value: `${formatNumber(mq5.adc_voltage_v, locale, 2)} V`,
                },
              ]}
              quality={telemetry.quality.mq5}
              calibration={telemetry.calibration.mq5}
              receivedAt={snapshot.received_at}
              trend="falling"
              relativeStatus={offline ? 'offline' : 'normal'}
              mq5Notice
            />
          )}

          <SensorUnavailableCard
            icon={Wind}
            titleKey="sensor.ammonia"
            descriptionKey="sensor.ammoniaHardware"
          />
          <SensorUnavailableCard
            icon={Droplets}
            titleKey="sensor.waterConsumption"
            descriptionKey="sensor.waterHardware"
          />
          <SensorUnavailableCard
            icon={Weight}
            titleKey="sensor.feedWeight"
            descriptionKey="sensor.feedHardware"
          />
        </div>
      </section>

      <TrendChart history={snapshot.history} />

      <div className="overview-bottom-grid">
        <AlertPanel alerts={snapshot.alerts} onAcknowledge={acknowledgeAlert} />
        <DeviceHealthCard snapshot={snapshot} />
      </div>

      <p className="simulation-footnote">
        <FlaskConical size={15} aria-hidden="true" />
        {t('header.simulation')} · {t(`scenario.${snapshot.scenario}`)}
      </p>
    </div>
  );
}
