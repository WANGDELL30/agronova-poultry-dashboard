import {
  BellRing,
  BrainCircuit,
  Camera,
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
  { href: '/mortality', labelKey: 'nav.mortality', icon: BrainCircuit },
  { href: '/live', labelKey: 'nav.live', icon: RadioTower },
  { href: '/history', labelKey: 'nav.history', icon: History },
  { href: '/alerts', labelKey: 'nav.alerts', icon: BellRing },
  { href: '/devices', labelKey: 'nav.devices', icon: ChartNoAxesCombined },
  { href: '/vision', labelKey: 'nav.vision', icon: Camera },
  { href: '/calibration', labelKey: 'nav.calibration', icon: FlaskConical },
  { href: '/exports', labelKey: 'nav.exports', icon: Upload },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export const mobilePrimaryItems = navigationItems.filter(({ href }) =>
  ['/overview', '/live', '/alerts', '/devices'].includes(href),
);

export const mobileMoreItems = navigationItems.filter(({ href }) =>
  ['/mortality', '/vision', '/history', '/calibration', '/exports', '/settings'].includes(href),
);

/**
 * The navigation item for an exact, known route (all routes are one segment deep). Prefix matching
 * made /live/extra look like Live Monitoring and /nope like Overview (AUDIT D10).
 */
function routeItem(pathname: string): NavigationItem | undefined {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return navigationItems.find(({ href }) => href === normalized);
}

export function activeHref(pathname: string): string | null {
  return routeItem(pathname)?.href ?? null;
}

/** Unknown paths (404) get a neutral title instead of a module name. */
export function pageTitleKey(pathname: string): TranslationKey {
  return routeItem(pathname)?.labelKey ?? 'app.shortName';
}
