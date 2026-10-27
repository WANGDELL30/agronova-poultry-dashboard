'use client';

import { SensorQuality } from '@agronova/telemetry-schema';
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Cpu,
  Droplets,
  Gauge,
  RadioTower,
  RefreshCw,
  Thermometer,
  Waves,
  Weight,
  Wind,
} from 'lucide-react';

import { useLanguage } from '../../lib/i18n/language-provider';
import { SectionHeader } from '../ui/section-header';
import { SensorUnavailableCard } from './sensor-card';
import { SummaryCard } from './summary-card';

export function WaitingTelemetryDashboard({
  unavailable,
  detail,
  onRetry,
}: Readonly<{
  unavailable: boolean;
  detail?: string;
  onRetry: () => void;
}>) {
  const { t } = useLanguage();
  const sensors = [
    { icon: Thermometer, titleKey: 'sensor.airTemperature' as const },
    { icon: Droplets, titleKey: 'sensor.airHumidity' as const },
    { icon: Waves, titleKey: 'sensor.waterTemperature' as const },
    { icon: Gauge, titleKey: 'sensor.mq5' as const },
    { icon: Wind, titleKey: 'sensor.ammonia' as const },
    { icon: Droplets, titleKey: 'sensor.waterConsumption' as const },
    { icon: Weight, titleKey: 'sensor.feedWeight' as const },
  ];

  return (
    <div className="overview-page">
      <section className="overview-intro">
        <p className="section-eyebrow">{t('overview.eyebrow')}</p>
        <h2>{t('overview.title')}</h2>
        <p>{t('overview.description')}</p>
      </section>

      <section className="waiting-telemetry-banner" role="status">
        <span className="state-icon neutral" aria-hidden="true">
          <RadioTower size={23} />
        </span>
        <div>
          <h2>{t('waiting.title')}</h2>
          <p>{t(unavailable ? 'waiting.unavailableDescription' : 'waiting.emptyDescription')}</p>
          {detail && <small>{detail}</small>}
        </div>
        {unavailable && (
          <button type="button" className="secondary-button" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" />
            {t('state.retry')}
          </button>
        )}
      </section>

      <section aria-labelledby="waiting-summary-heading">
        <h2 className="sr-only" id="waiting-summary-heading">
          {t('overview.summary')}
        </h2>
        <div className="summary-grid">
          <SummaryCard
            icon={Cpu}
            label={t('summary.devicesOnline')}
            value="—"
            detail={t('waiting.device')}
          />
          <SummaryCard
            icon={BellRing}
            label={t('summary.activeAlerts')}
            value="—"
            detail={t('waiting.alerts')}
          />
          <SummaryCard
            icon={CheckCircle2}
            label={t('summary.dataQuality')}
            value={t('status.UNKNOWN')}
            detail={t('waiting.quality')}
          />
          <SummaryCard
            icon={Clock3}
            label={t('summary.lastTelemetry')}
            value="—"
            detail={t('waiting.telemetry')}
          />
        </div>
      </section>

      <section className="sensor-section" aria-labelledby="waiting-sensor-heading">
        <SectionHeader
          titleId="waiting-sensor-heading"
          title={t('overview.sensors')}
          description={t('waiting.sensorsDescription')}
        />
        <div className="sensor-grid">
          {sensors.map(({ icon, titleKey }) => (
            <SensorUnavailableCard
              key={titleKey}
              icon={icon}
              titleKey={titleKey}
              descriptionKey="sensor.waitingDescription"
              quality={SensorQuality.UNKNOWN}
              waiting
            />
          ))}
        </div>
      </section>

      <p className="simulation-footnote">
        <RadioTower size={15} aria-hidden="true" />
        {t('overview.liveFootnote')}
      </p>
    </div>
  );
}
