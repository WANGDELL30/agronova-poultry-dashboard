'use client';

import { Leaf } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useLanguage } from '../../lib/i18n/language-provider';
import { navigationItems } from './navigation';

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <aside className="sidebar">
      <Link className="sidebar-brand" href="/overview" aria-label={t('app.name')}>
        <span className="sidebar-logo" aria-hidden="true">
          <Leaf size={21} strokeWidth={2.2} />
        </span>
        <span className="sidebar-brand-copy">
          <strong>{t('app.shortName')}</strong>
          <small>Poultry AI IoT</small>
        </span>
      </Link>

      <nav className="sidebar-nav" aria-label={t('nav.primary')}>
        {navigationItems.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              className={`sidebar-link${active ? ' is-active' : ''}`}
              href={href}
              key={href}
              aria-current={active ? 'page' : undefined}
              title={t(labelKey)}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-pulse" aria-hidden="true" />
        <span>
          <strong>F1</strong>
          <small>Frontend foundation</small>
        </span>
      </div>
    </aside>
  );
}
