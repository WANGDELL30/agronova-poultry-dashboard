'use client';

import type { ModelStatus } from '@agronova/mortality-model';
import { BrainCircuit, CheckCircle2, Database, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../lib/i18n/language-provider';
import { SectionHeader } from '../ui/section-header';

type ModelState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; model: ModelStatus };

export function MortalityDashboard() {
  const { t } = useLanguage();
  const [state, setState] = useState<ModelState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    setState({ kind: 'loading' });
    void fetch('/api/v1/mortality/model', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Model unavailable');
        const model = (await response.json()) as ModelStatus;
        if (active) setState({ kind: 'ready', model });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt]);

  return (
    <div className="overview-page mortality-page">
      <section className="overview-intro">
        <p className="section-eyebrow">{t('mortality.eyebrow')}</p>
        <h2>{t('mortality.title')}</h2>
        <p>{t('mortality.description')}</p>
      </section>

      <section
        className="panel mortality-hero"
        aria-labelledby="mortality-model-title"
        aria-busy={state.kind === 'loading'}
      >
        <div className="mortality-model-icon">
          <BrainCircuit size={30} aria-hidden="true" />
        </div>
        <div className="mortality-model-copy">
          <p className="section-eyebrow">LSTM · model_mortalitas_lstm.h5</p>
          <h2 id="mortality-model-title">
            {t(
              state.kind === 'ready'
                ? 'mortality.installed'
                : state.kind === 'loading'
                  ? 'mortality.loading'
                  : 'mortality.unavailable',
            )}
          </h2>
          <p>{t('mortality.awaiting')}</p>
        </div>
        {state.kind === 'ready' && (
          <span className="mortality-badge">
            <CheckCircle2 size={15} aria-hidden="true" />
            {t('mortality.runtimeReady')}
          </span>
        )}
        {state.kind === 'error' && (
          <button className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>
            {t('state.retry')}
          </button>
        )}
      </section>

      {state.kind === 'ready' && (
        <div className="mortality-facts">
          <div className="panel">
            <span>{t('mortality.window')}</span>
            <strong>{state.model.input.timesteps}</strong>
            <small>{t('mortality.steps')}</small>
          </div>
          <div className="panel">
            <span>{t('mortality.inputFeatures')}</span>
            <strong>{state.model.input.available_non_gas_features}/9</strong>
            <small>{t('mortality.orderUnknown')}</small>
          </div>
          <div className="panel">
            <span>{t('mortality.output')}</span>
            <strong>{state.model.output.classes}</strong>
            <small>{t('mortality.labelsUnknown')}</small>
          </div>
        </div>
      )}

      <section className="panel" aria-labelledby="mortality-available-title">
        <SectionHeader
          titleId="mortality-available-title"
          title={t('mortality.availableTitle')}
          description={t('mortality.availableDescription')}
        />
        <div className="mortality-notice mortality-available-notice">
          <Database size={20} aria-hidden="true" />
          <p>{t('mortality.availableFeatures')}</p>
        </div>
      </section>

      <section className="panel" aria-labelledby="mortality-readiness-title">
        <SectionHeader
          titleId="mortality-readiness-title"
          title={t('mortality.readiness')}
          description={t('mortality.readinessDescription')}
        />
        <div className="mortality-notice">
          <Info size={20} aria-hidden="true" />
          <p>{t('mortality.noPrediction')}</p>
        </div>
        <div className="mortality-notice mortality-danger-notice">
          <Info size={20} aria-hidden="true" />
          <p>{t('mortality.evaluationWarning')}</p>
        </div>
        <ul className="mortality-checklist">
          {(['gas', 'scaler', 'retraining', 'validation'] as const).map((key) => (
            <li key={key}>
              <span className="mortality-pending-dot" />
              <span>{t(`mortality.need.${key}`)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
