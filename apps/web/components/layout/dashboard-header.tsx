'use client';

import { ChevronDown, Clock3, Cpu, Leaf, UserRound } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { formatClock, formatRelativeTime } from '../../lib/formatting/formatters';
import { useLanguage } from '../../lib/i18n/language-provider';
import { useTelemetry } from '../../lib/telemetry/telemetry-provider';
import { pageTitleKey } from './navigation';

export function DashboardHeader() {
  const pathname = usePathname();
  const { language, locale, setLanguage, t } = useLanguage();
  const { mode, scenario, state } = useTelemetry();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const receivedAt = state.kind === 'ready' ? state.snapshot.received_at : null;
  const deviceId =
    state.kind === 'ready' ? state.snapshot.telemetry.device_id : 'AGRONOVA-ESP32-01';
  const modeLabel = mode === 'mock' ? t('header.simulation') : t('header.live');
  const scenarioLabel = scenario ? t(`scenario.${scenario}`) : null;

  return (
    <header className="dashboard-header">
      <div className="mobile-brand-row">
        <span className="mobile-logo" aria-hidden="true">
          <Leaf size={19} />
        </span>
        <strong>{t('app.shortName')}</strong>
      </div>

      <div className="header-title-row">
        <div>
          <p className="header-eyebrow">{t('app.tagline')}</p>
          <h1>{t(pageTitleKey(pathname))}</h1>
        </div>
        <div className={`simulation-badge mode-${mode}`}>
          <span className="simulation-dot" aria-hidden="true" />
          <span>{modeLabel}</span>
          {scenarioLabel && <small>{scenarioLabel}</small>}
        </div>
      </div>

      <div className="header-controls">
        <label className="header-select">
          <span>{t('header.farm')}</span>
          <span className="select-control">
            <select defaultValue="kkg" aria-label={t('header.farm')}>
              <option value="kkg">{t('selection.farm')}</option>
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </span>
        </label>

        <label className="header-select">
          <span>{t('header.house')}</span>
          <span className="select-control">
            <select defaultValue="house-a" aria-label={t('header.house')}>
              <option value="house-a">{t('selection.house')}</option>
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </span>
        </label>

        <div className="header-device" title={deviceId}>
          <span>{t('header.device')}</span>
          <strong>
            <Cpu size={15} aria-hidden="true" />
            {deviceId}
          </strong>
        </div>

        <div className="header-time">
          <Clock3 size={17} aria-hidden="true" />
          <span>
            <small>{t('header.localTime')} · WIB</small>
            <strong>{now ? formatClock(now, locale) : '--:--:--'}</strong>
          </span>
        </div>

        <div className="header-update">
          <span>{t('header.lastUpdate')}</span>
          <strong>
            {receivedAt && now ? formatRelativeTime(receivedAt, locale, now) : t('header.waiting')}
          </strong>
        </div>

        <div className="language-toggle" role="group" aria-label={t('header.language')}>
          <button
            type="button"
            className={language === 'id' ? 'is-active' : undefined}
            onClick={() => setLanguage('id')}
            aria-pressed={language === 'id'}
          >
            ID
          </button>
          <button
            type="button"
            className={language === 'en' ? 'is-active' : undefined}
            onClick={() => setLanguage('en')}
            aria-pressed={language === 'en'}
          >
            EN
          </button>
        </div>

        <button type="button" className="user-avatar" aria-label={t('header.user')}>
          <UserRound size={18} aria-hidden="true" />
          <span>OP</span>
        </button>
      </div>
    </header>
  );
}
