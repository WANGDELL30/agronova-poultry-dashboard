import {
  BellRing,
  ChartNoAxesCombined,
  FlaskConical,
  Gauge,
  History,
  RadioTower,
  Settings,
  Upload,
  type LucideIcon,
} from 'lucide-react';

import type { TranslationKey } from '../../lib/i18n/translations';

export interface NavigationItem {
  href: string;
  labelKey: TranslationKey;
  shortLabelKey?: TranslationKey;
  icon: LucideIcon;
}

export const navigationItems: NavigationItem[] = [
  { href: '/overview', labelKey: 'nav.overview', icon: Gauge },
  { href: '/live', labelKey: 'nav.live', icon: RadioTower },
  { href: '/history', labelKey: 'nav.history', icon: History },
  { href: '/alerts', labelKey: 'nav.alerts', icon: BellRing },
  { href: '/devices', labelKey: 'nav.devices', icon: ChartNoAxesCombined },
  { href: '/calibration', labelKey: 'nav.calibration', icon: FlaskConical },
  { href: '/exports', labelKey: 'nav.exports', icon: Upload },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export const mobilePrimaryItems = navigationItems.filter(({ href }) =>
  ['/overview', '/live', '/alerts', '/devices'].includes(href),
);

export const mobileMoreItems = navigationItems.filter(({ href }) =>
  ['/history', '/calibration', '/exports', '/settings'].includes(href),
);

export function pageTitleKey(pathname: string): TranslationKey {
  return navigationItems.find(({ href }) => pathname.startsWith(href))?.labelKey ?? 'nav.overview';
}
