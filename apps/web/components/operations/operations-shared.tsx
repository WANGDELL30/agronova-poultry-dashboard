'use client';

import { CircleCheck, DatabaseZap, RefreshCw, RadioTower, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useLanguage } from '../../lib/i18n/language-provider';
import type { TelemetryState } from '../../lib/telemetry/types';
import { operationsCopy } from './operations-copy';

export function OperationsPage({
  eyebrow,
  title,
  description,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}>) {
  return (
    <div className="operations-page">
      <section className="operations-intro">
        <p className="section-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </section>
      {children}
    </div>
  );
}

export function ConnectionBanner({
  state,
  onRetry,
}: Readonly<{ state: TelemetryState; onRetry: () => void }>) {
  const { language } = useLanguage();
  const copy = operationsCopy[language].common;
  const ready = state.kind === 'ready';
  const unavailable = state.kind === 'unavailable';
  const error = state.kind === 'error';
  const loading = state.kind === 'loading';
  const Icon = ready ? CircleCheck : unavailable || error ? DatabaseZap : RadioTower;
  const title = ready
    ? copy.connected
    : loading
      ? copy.connecting
      : unavailable
        ? copy.unavailable
        : error
          ? copy.error
          : copy.waiting;
  const description = ready
    ? copy.connectedDescription
    : loading
      ? copy.connectingDescription
      : unavailable
        ? copy.unavailableDescription
        : error
          ? copy.errorDescription
          : copy.waitingDescription;

  return (
    <section
      className={`operations-status${ready ? ' is-ready' : unavailable || error ? ' is-unavailable' : ''}`}
      role="status"
    >
      <span className="operations-status-icon" aria-hidden="true">
        <Icon size={21} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        {'message' in state && <small>{state.message}</small>}
      </div>
      {(unavailable || error) && (
        <button type="button" className="secondary-button" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" />
          {copy.retry}
        </button>
      )}
    </section>
  );
}

export function OperationsStat({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'default',
}: Readonly<{
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'success' | 'warning';
}>) {
  return (
    <article className={`operations-stat tone-${tone}`}>
      <span aria-hidden="true">
        <Icon size={19} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

export function OperationsPanel({
  title,
  description,
  action,
  className = '',
  children,
}: Readonly<{
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <section className={`operations-panel ${className}`.trim()}>
      <div className="operations-panel-header">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function WaitingRow({
  icon: Icon = RadioTower,
  title,
  description,
}: Readonly<{ icon?: LucideIcon; title: string; description: string }>) {
  return (
    <div className="operations-waiting-row">
      <span aria-hidden="true">
        <Icon size={19} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}
