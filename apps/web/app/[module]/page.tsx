import { notFound } from 'next/navigation';

import { navigationItems } from '../../components/layout/navigation';
import { PlaceholderModule } from '../../components/ui/placeholder-module';

const placeholderRoutes = new Set([
  'live',
  'history',
  'alerts',
  'devices',
  'calibration',
  'exports',
  'settings',
]);

export function generateStaticParams() {
  return [...placeholderRoutes].map((module) => ({ module }));
}

export default async function FutureModulePage({
  params,
}: Readonly<{ params: Promise<{ module: string }> }>) {
  const { module } = await params;
  if (!placeholderRoutes.has(module)) {
    notFound();
  }

  const navigationItem = navigationItems.find(({ href }) => href === `/${module}`);
  if (!navigationItem) {
    notFound();
  }

  return <PlaceholderModule titleKey={navigationItem.labelKey} />;
}
