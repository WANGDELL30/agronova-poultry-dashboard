'use client';

import { BellRing, Check, CircleAlert, Info, MoveUpRight } from 'lucide-react';
import Link from 'next/link';

import { formatRelativeTime } from '../../lib/formatting/formatters';
import { useLanguage } from '../../lib/i18n/language-provider';
import type { DashboardAlert } from '../../lib/telemetry/types';
import { SectionHeader } from '../ui/section-header';

export function AlertPanel({
  alerts,
  onAcknowledge,
}: Readonly<{ alerts: DashboardAlert[]; onAcknowledge: (alertId: string) => void }>) {
  const { locale, t } = useLanguage();

  return (
    <section className="panel alert-panel">
      <SectionHeader
        eyebrow={t('summary.activeAlerts')}
        title={t('alerts.title')}
        description={t('alerts.description')}
        action={
          <span className="panel-count" aria-label={`${alerts.length} ${t('alerts.title')}`}>
            <BellRing size={15} aria-hidden="true" />
            {alerts.filter((alert) => !alert.acknowledged).length}
          </span>
        }
      />

      <div className="alert-list">
        {alerts.length === 0 && <p className="alert-empty">{t('alerts.noActive')}</p>}
        {alerts.map((alert) => {
          const SeverityIcon = alert.severity === 'warning' ? CircleAlert : Info;
          return (
            <article
              className={`alert-item severity-${alert.severity}${alert.acknowledged ? ' is-acknowledged' : ''}`}
              key={alert.id}
            >
              <span className="alert-severity-icon" aria-hidden="true">
                <SeverityIcon size={19} />
              </span>
              <div className="alert-copy">
                <div className="alert-title-row">
                  <span className="alert-severity-label">
                    {t(alert.severity === 'warning' ? 'alerts.warning' : 'alerts.information')}
                  </span>
                  <time dateTime={alert.occurredAt}>
                    {formatRelativeTime(alert.occurredAt, locale)}
                  </time>
                </div>
                <h3>{t(alert.titleKey)}</h3>
                <p>{t(alert.descriptionKey)}</p>
                <small>{alert.deviceId}</small>
              </div>
              <div className="alert-actions">
                <Link href="/alerts">
                  {t('alerts.viewDetails')}
                  <MoveUpRight size={14} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => onAcknowledge(alert.id)}
                  disabled={alert.acknowledged}
                >
                  <Check size={14} aria-hidden="true" />
                  {t(alert.acknowledged ? 'alerts.acknowledged' : 'alerts.acknowledge')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
