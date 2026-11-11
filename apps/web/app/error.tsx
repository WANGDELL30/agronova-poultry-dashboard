'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { useLanguage } from '../lib/i18n/language-provider';

/** Catches render errors in a page so the shell and navigation stay usable (AUDIT H2). */
export default function RouteError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const { t } = useLanguage();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="state-panel error-state" role="alert">
      <span className="state-icon danger" aria-hidden="true">
        <TriangleAlert size={25} />
      </span>
      <div>
        <h2>{t('error.title')}</h2>
        <p>{t('error.description')}</p>
      </div>
      <button type="button" className="secondary-button" onClick={() => reset()}>
        <RefreshCw size={16} aria-hidden="true" />
        {t('state.retry')}
      </button>
    </section>
  );
}
