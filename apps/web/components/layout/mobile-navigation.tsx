'use client';

import { MoreHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { useLanguage } from '../../lib/i18n/language-provider';
import { mobileMoreItems, mobilePrimaryItems } from './navigation';

export function MobileNavigation() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRouteActive = mobileMoreItems.some(({ href }) => pathname.startsWith(href));

  return (
    <>
      {moreOpen && (
        <div className="mobile-more-panel" id="mobile-more-menu">
          <div className="mobile-more-header">
            <strong>{t('nav.more')}</strong>
            <button
              type="button"
              className="icon-button"
              onClick={() => setMoreOpen(false)}
              aria-label={t('nav.closeMore')}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="mobile-more-grid">
            {mobileMoreItems.map(({ href, labelKey, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  href={href}
                  key={href}
                  className={active ? 'is-active' : undefined}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span>{t(labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav className="mobile-navigation" aria-label={t('nav.primary')}>
        {mobilePrimaryItems.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              href={href}
              key={href}
              className={active ? 'is-active' : undefined}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={moreOpen || moreRouteActive ? 'is-active' : undefined}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
        >
          <MoreHorizontal size={22} aria-hidden="true" />
          <span>{t('nav.more')}</span>
        </button>
      </nav>
    </>
  );
}
