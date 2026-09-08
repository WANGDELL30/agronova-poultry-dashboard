'use client';

import { CalibrationStatus, SensorQuality } from '@agronova/telemetry-schema';
import { Info, Minus, PackageOpen, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';

import { formatNumber, formatRelativeTime } from '../../lib/formatting/formatters';
import { useLanguage } from '../../lib/i18n/language-provider';
import type { TranslationKey } from '../../lib/i18n/translations';
import { CalibrationBadge, StatusBadge } from '../ui/status-badge';

type TrendDirection = 'rising' | 'falling' | 'stable';
type RelativeStatus = 'normal' | 'warning' | 'elevated' | 'offline';

interface SensorDetail {
  labelKey: TranslationKey;
  value: string;
}

export function SensorCard({
  icon: Icon,
  titleKey,
  value,
  digits = 1,
  unit,
  primaryLabelKey = 'sensor.filtered',
  details,
  quality,
  calibration,
  receivedAt,
  trend,
  relativeStatus,
  mq5Notice = false,
}: Readonly<{
  icon: LucideIcon;
  titleKey: TranslationKey;
  value: number;
  digits?: number;
  unit: string;
  primaryLabelKey?: TranslationKey;
  details: SensorDetail[];
  quality: SensorQuality;
  calibration: CalibrationStatus;
  receivedAt: string;
  trend: TrendDirection;
  relativeStatus: RelativeStatus;
  mq5Notice?: boolean;
}>) {
  const { locale, t } = useLanguage();
  const TrendIcon = trend === 'rising' ? TrendingUp : trend === 'falling' ? TrendingDown : Minus;

  return (
    <article className="sensor-card">
      <div className="sensor-card-header">
        <span className="sensor-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div>
          <h3>{t(titleKey)}</h3>
          <span className={`relative-status relative-${relativeStatus}`}>
            <span aria-hidden="true" />
            {t(`relative.${relativeStatus}`)}
          </span>
        </div>
        {mq5Notice && (
          <details className="info-tooltip">
            <summary aria-label={t('sensor.mq5InfoLabel')}>
              <Info size={17} aria-hidden="true" />
            </summary>
            <p>{t('sensor.mq5Info')}</p>
          </details>
        )}
      </div>

      <div className="sensor-primary">
        <span>{t(primaryLabelKey)}</span>
        <strong>
          {formatNumber(value, locale, digits)} <small>{unit}</small>
        </strong>
      </div>

      <dl className="sensor-details">
        {details.map((detail) => (
          <div key={detail.labelKey}>
            <dt>{t(detail.labelKey)}</dt>
            <dd>{detail.value}</dd>
          </div>
        ))}
      </dl>

      <div className="sensor-badges">
        <StatusBadge status={quality} />
        <CalibrationBadge status={calibration} />
      </div>

      <div className="sensor-footer">
        <span>{formatRelativeTime(receivedAt, locale)}</span>
        <span className={`trend trend-${trend}`}>
          <TrendIcon size={15} aria-hidden="true" />
          {t(`sensor.trend.${trend}`)}
        </span>
      </div>
    </article>
  );
}

export function SensorUnavailableCard({
  icon: Icon = PackageOpen,
  titleKey,
  descriptionKey,
}: Readonly<{
  icon?: LucideIcon;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
}>) {
  const { t } = useLanguage();

  return (
    <article className="sensor-card sensor-unavailable">
      <div className="sensor-card-header">
        <span className="sensor-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div>
          <h3>{t(titleKey)}</h3>
          <span className="relative-status relative-unavailable">
            <span aria-hidden="true" />
            {t('relative.unavailable')}
          </span>
        </div>
      </div>
      <div className="unavailable-value" aria-label={t('sensor.notAvailable')}>
        —
      </div>
      <StatusBadge status={SensorQuality.NOT_INSTALLED} />
      <p className="unavailable-copy">{t(descriptionKey)}</p>
    </article>
  );
}
