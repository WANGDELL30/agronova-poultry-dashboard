/**
 * Parses `WEB_ORIGIN` (comma-separated). Trailing slashes are stripped because the browser's
 * `Origin` header never has one. An empty list or `*` fails startup: `@fastify/cors` would
 * otherwise reject every origin silently, or allow every origin (AUDIT S13, R15).
 */
export function parseAllowedOrigins(value: string | undefined): string[] {
  const origins = (value ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('WEB_ORIGIN is empty; list the web origins allowed to call the API.');
  }
  if (origins.some((origin) => origin.includes('*'))) {
    throw new Error('WEB_ORIGIN must not contain "*"; list the web origins explicitly.');
  }
  return origins;
}
