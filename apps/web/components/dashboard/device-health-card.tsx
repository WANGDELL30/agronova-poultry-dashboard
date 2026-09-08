'use client';

import { SensorQuality } from '@agronova/telemetry-schema';
import { Cpu, RadioTower } from 'lucide-react';

import { formatDateTime, formatDuration, formatNumber } from '../../lib/formatting/formatters';
import { useLanguage } from '../../lib/i18n/language-provider';
import type { DashboardSnapshot } from '../../lib/telemetry/types';
import { SectionHeader } from '../ui/section-header';
import { StatusBadge } from '../ui/status-badge';

export function DeviceHealthCard({ snapshot }: Readonly<{ snapshot: DashboardSnapshot }>) {
  const { locale, t } = useLanguage();
  const { telemetry } = snapshot;

  const details = [
    [t('device.id'), telemetry.device_id],
    [t('device.firmware'), telemetry.device.firmware_version],
    [t('device.wifi'), `${formatNumber(telemetry.device.wifi_rssi_dbm, locale, 0)} dBm`],
    [t('device.uptime'), formatDuration(telemetry.device.uptime_s, locale)],
    [t('device.lastSeen'), formatDateTime(snapshot.last_seen_at, locale)],
    [t('device.sequence'), new Intl.NumberFormat(locale).format(telemetry.sequence_no)],
    [t('device.installedSensors'), `${snapshot.installedSensorCount}/7`],
    [t('device.calibrating'), String(snapshot.calibratingSensorCount)],
    [t('device.disconnected'), String(snapshot.disconnectedSensorCount)],
  ];

  return (
    <section className="panel device-panel">
      <SectionHeader title={t('device.title')} description={t('device.description')} />
      <div className={`device-hero${snapshot.deviceOnline ? '' : ' is-offline'}`}>
        <span className="device-icon" aria-hidden="true">
          <Cpu size={27} />
        </span>
        <div>
          <strong>{t(snapshot.deviceOnline ? 'device.online' : 'device.offline')}</strong>
          <span>
            <RadioTower size={14} aria-hidden="true" /> {telemetry.device.wifi_rssi_dbm} dBm
          </span>
        </div>
        <StatusBadge
          status={snapshot.deviceOnline ? SensorQuality.VALID : SensorQuality.DEVICE_OFFLINE}
        />
      </div>
      <dl className="device-details">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
