'use client';

import Image from 'next/image';

import { useLanguage } from '../../lib/i18n/language-provider';

export function CollaborationMark() {
  const { t } = useLanguage();

  return (
    <aside className="header-collaboration" aria-label={t('collaboration.partners')}>
      <div className="header-partner-logos">
        <span className="header-partner-logo header-partner-kkg">
          <Image
            src="/partners/karya-kreasi-group-logo.png"
            alt={t('collaboration.kkgAlt')}
            width={1054}
            height={1408}
            sizes="38px"
          />
        </span>
        <span className="header-collaboration-symbol" aria-hidden="true">
          ×
        </span>
        <span className="header-partner-logo header-partner-dsc">
          <Image
            src="/partners/dsc-logo.png"
            alt={t('collaboration.dscAlt')}
            width={1018}
            height={478}
            sizes="(max-width: 767px) 150px, 142px"
          />
        </span>
      </div>
    </aside>
  );
}
