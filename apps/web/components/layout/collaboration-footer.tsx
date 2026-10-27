'use client';

import Image from 'next/image';

import { useLanguage } from '../../lib/i18n/language-provider';

export function CollaborationFooter() {
  const { t } = useLanguage();

  return (
    <footer className="collaboration-footer" aria-labelledby="collaboration-title">
      <div className="collaboration-footer-inner">
        <div className="collaboration-copy">
          <p className="section-eyebrow">{t('collaboration.eyebrow')}</p>
          <h2 id="collaboration-title">{t('collaboration.title')}</h2>
          <p>{t('collaboration.description')}</p>
        </div>

        <div className="collaboration-logos" aria-label={t('collaboration.partners')}>
          <div className="partner-logo partner-logo-dsc">
            <Image
              src="/partners/dsc-logo.png"
              alt={t('collaboration.dscAlt')}
              width={1018}
              height={478}
              sizes="(max-width: 767px) 82vw, 360px"
            />
          </div>
          <span className="collaboration-mark" aria-hidden="true">
            ×
          </span>
          <div className="partner-logo partner-logo-kkg">
            <Image
              src="/partners/karya-kreasi-group-logo.png"
              alt={t('collaboration.kkgAlt')}
              width={1054}
              height={1408}
              sizes="(max-width: 767px) 160px, 112px"
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
