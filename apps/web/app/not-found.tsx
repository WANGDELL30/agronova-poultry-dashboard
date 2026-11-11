'use client';

import { SearchX } from 'lucide-react';
import Link from 'next/link';

import { useLanguage } from '../lib/i18n/language-provider';

/** Localized 404 rendered inside the app shell (AUDIT H2). */
export default function NotFound() {
  const { t } = useLanguage();

  return (
    <section className="state-panel error-state">
      <span className="state-icon neutral" aria-hidden="true">
        <SearchX size={25} />
      </span>
      <div>
        <h2>{t('notFound.title')}</h2>
        <p>{t('notFound.description')}</p>
      </div>
      <Link className="secondary-button" href="/overview">
        {t('notFound.back')}
      </Link>
    </section>
  );
}
