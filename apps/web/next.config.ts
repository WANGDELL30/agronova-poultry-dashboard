import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

import { checkApiBaseUrl, checkDeviceId } from './lib/config/api-base-url-check';
import { securityHeaders } from './lib/config/security-headers';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const check = checkApiBaseUrl(process.env);
    if (check.level === 'error') throw new Error(`[agronova/web] ${check.message}`);
    if (check.level === 'warn') console.warn(`[agronova/web] warning: ${check.message}`);
    const deviceWarning = checkDeviceId(process.env);
    if (deviceWarning) console.warn(`[agronova/web] warning: ${deviceWarning}`);
  }
  return nextConfig;
}
