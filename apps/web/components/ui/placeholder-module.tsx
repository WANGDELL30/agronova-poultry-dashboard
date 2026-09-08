'use client';

import { ArrowLeft, Construction } from 'lucide-react';
import Link from 'next/link';

import { useLanguage } from '../../lib/i18n/language-provider';
import type { TranslationKey } from '../../lib/i18n/translations';

export function PlaceholderModule({ titleKey }: Readonly<{ titleKey: TranslationKey }>) {
  const { t } = useLanguage();

  return (
    <section className="placeholder-module">
      <span className="placeholder-icon" aria-hidden="true">
        <Construction size={30} />
      </span>
      <p className="section-eyebrow">{t('placeholder.eyebrow')}</p>
      <h2>
        {t(titleKey)} {t('placeholder.titleSuffix')}
      </h2>
      <p>{t('placeholder.description')}</p>
      <Link className="primary-button" href="/overview">
        <ArrowLeft size={16} aria-hidden="true" />
        {t('placeholder.back')}
      </Link>
    </section>
  );
}
