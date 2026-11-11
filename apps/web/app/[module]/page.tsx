import { notFound } from 'next/navigation';

import { OperationsDashboard } from '../../components/operations/operations-dashboard';
import type { OperationsModule } from '../../components/operations/operations-copy';

const operationsRoutes = new Set<OperationsModule>([
  'live',
  'history',
  'alerts',
  'devices',
  'calibration',
  'exports',
  'settings',
]);

// Unknown slugs get the static 404 instead of an on-demand render cached as ISR (AUDIT D9).
export const dynamicParams = false;

export function generateStaticParams() {
  return [...operationsRoutes].map((module) => ({ module }));
}

export default async function OperationsModulePage({
  params,
}: Readonly<{ params: Promise<{ module: string }> }>) {
  const { module } = await params;
  if (!operationsRoutes.has(module as OperationsModule)) {
    notFound();
  }

  return <OperationsDashboard module={module as OperationsModule} />;
}
