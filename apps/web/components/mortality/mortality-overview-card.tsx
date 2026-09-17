'use client';

import { ArrowUpRight, BrainCircuit } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '../../lib/i18n/language-provider';

export function MortalityOverviewCard() {
  const { t } = useLanguage();
  return (
    <section className="panel mortality-overview" aria-labelledby="mortality-overview-title">
      <div className="mortality-model-icon">
        <BrainCircuit size={26} aria-hidden="true" />
      </div>
      <div>
        <p className="section-eyebrow">{t('mortality.eyebrow')}</p>
        <h2 id="mortality-overview-title">{t('mortality.title')}</h2>
        <p>{t('mortality.awaiting')}</p>
      </div>
      <Link className="secondary-button" href="/mortality">
        {t('mortality.open')}
        <ArrowUpRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
