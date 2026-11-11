import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

import { checkApiBaseUrl } from './lib/config/api-base-url-check';

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const check = checkApiBaseUrl(process.env);
    if (check.level === 'error') throw new Error(`[agronova/web] ${check.message}`);
    if (check.level === 'warn') console.warn(`[agronova/web] warning: ${check.message}`);
  }
  return nextConfig;
}
