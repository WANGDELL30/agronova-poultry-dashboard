'use client';

import { DatabaseZap, Inbox, RefreshCw, TriangleAlert } from 'lucide-react';

import { useLanguage } from '../../lib/i18n/language-provider';

export function LoadingSkeleton() {
  const { t } = useLanguage();

  return (
    <section className="state-panel loading-panel" aria-busy="true" aria-live="polite">
      <div className="state-heading">
        <span className="loading-mark" aria-hidden="true" />
        <div>
          <h2>{t('state.loadingTitle')}</h2>
          <p>{t('state.loadingDescription')}</p>
        </div>
      </div>
      <div className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <span className="skeleton-card" key={index} />
        ))}
      </div>
    </section>
  );
}

export function EmptyState({ compact = false }: Readonly<{ compact?: boolean }>) {
  const { t } = useLanguage();

  return (
    <div className={`empty-state${compact ? ' is-compact' : ''}`} role="status">
      <span className="state-icon neutral" aria-hidden="true">
        <Inbox size={23} />
      </span>
      <div>
        <strong>{compact ? t('trend.emptyTitle') : t('state.emptyTitle')}</strong>
        <p>{compact ? t('trend.emptyDescription') : t('state.emptyDescription')}</p>
      </div>
    </div>
  );
}

export function ErrorState({
  unavailable,
  detail,
  onRetry,
}: Readonly<{ unavailable?: boolean; detail?: string; onRetry: () => void }>) {
  const { t } = useLanguage();
  const Icon = unavailable ? DatabaseZap : TriangleAlert;

  return (
    <section className="state-panel error-state" role="alert">
      <span className={`state-icon ${unavailable ? 'neutral' : 'danger'}`} aria-hidden="true">
        <Icon size={25} />
      </span>
      <div>
        <h2>{t(unavailable ? 'state.unavailableTitle' : 'state.errorTitle')}</h2>
        <p>{t(unavailable ? 'state.unavailableDescription' : 'state.errorDescription')}</p>
        {detail && <small>{detail}</small>}
      </div>
      <button type="button" className="secondary-button" onClick={onRetry}>
        <RefreshCw size={16} aria-hidden="true" />
        {t('state.retry')}
      </button>
    </section>
  );
}
