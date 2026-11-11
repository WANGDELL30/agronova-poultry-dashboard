export type ApiBaseUrlCheck = { level: 'ok' } | { level: 'warn' | 'error'; message: string };

/**
 * Build-time check for NEXT_PUBLIC_API_BASE_URL (AUDIT D4). The value is inlined into the browser
 * bundle, so a Vercel production build without an https API URL would ship a dashboard that can
 * never reach the API. Every other build (local, root `pnpm build`, preview) only warns.
 */
export function checkApiBaseUrl(
  env: Readonly<Record<string, string | undefined>>,
): ApiBaseUrlCheck {
  const value = env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? '';
  let problem: string | null = null;
  if (value === '') {
    problem = 'NEXT_PUBLIC_API_BASE_URL is empty';
  } else {
    let protocol: string | null;
    try {
      protocol = new URL(value).protocol;
    } catch {
      protocol = null;
    }
    if (protocol !== 'https:') {
      problem = `NEXT_PUBLIC_API_BASE_URL must be an absolute https: URL (got "${value}")`;
    }
  }
  if (!problem) return { level: 'ok' };

  if (env.VERCEL_ENV === 'production') {
    return {
      level: 'error',
      message: `${problem}. Set it in the Vercel project (Production) to the public https API URL and redeploy.`,
    };
  }
  return {
    level: 'warn',
    message:
      value === ''
        ? `${problem}. The dashboard will show "API not configured" and request no data.`
        : `${problem}. Fine for local http; an https site cannot call an http API (mixed content).`,
  };
}
