'use client';

import { CalibrationStatus, SensorQuality } from '@agronova/telemetry-schema';
import {
  CircleCheck,
  CircleHelp,
  FlaskConical,
  MinusCircle,
  OctagonX,
  PlugZap,
  TimerOff,
  WifiOff,
} from 'lucide-react';

import { useLanguage } from '../../lib/i18n/language-provider';

const statusIcons = {
  [SensorQuality.NOT_INSTALLED]: MinusCircle,
  [SensorQuality.DISCONNECTED]: PlugZap,
  [SensorQuality.INVALID]: OctagonX,
  [SensorQuality.STALE]: TimerOff,
  [SensorQuality.CALIBRATING]: FlaskConical,
  [SensorQuality.VALID]: CircleCheck,
  [SensorQuality.DEVICE_OFFLINE]: WifiOff,
  [SensorQuality.UNKNOWN]: CircleHelp,
};

export function StatusBadge({ status }: Readonly<{ status: SensorQuality }>) {
  const { t } = useLanguage();
  const Icon = statusIcons[status];

  return (
    <span className={`status-badge status-${status.toLowerCase().replaceAll('_', '-')}`}>
      <Icon size={14} aria-hidden="true" />
      {t(`status.${status}`)}
    </span>
  );
}

export function CalibrationBadge({ status }: Readonly<{ status: CalibrationStatus }>) {
  const { t } = useLanguage();

  return (
    <span className={`calibration-badge calibration-${status.toLowerCase().replaceAll('_', '-')}`}>
      <FlaskConical size={13} aria-hidden="true" />
      {t(`calibration.${status}`)}
    </span>
  );
}
