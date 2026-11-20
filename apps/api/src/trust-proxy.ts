import { isIP } from 'node:net';

/**
 * Parses `API_TRUST_PROXY`: comma-separated proxy addresses or CIDR ranges whose
 * `X-Forwarded-For` the API believes, for example `127.0.0.1,::1` when cloudflared runs on the
 * same machine (AUDIT D17). Unset or blank = trust no proxy (`request.ip` is the socket peer).
 *
 * `true`, `*` and hop counts are refused: they would let any client choose the logged IP by
 * sending its own `X-Forwarded-For`.
 */
export function parseTrustProxy(value: string | undefined): string[] | false {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return false;

  for (const entry of entries) {
    const [address = '', prefix, ...rest] = entry.split('/');
    const family = isIP(address);
    const maxPrefix = family === 4 ? 32 : 128;
    const validPrefix =
      prefix === undefined || (/^\d{1,3}$/.test(prefix) && Number(prefix) <= maxPrefix);
    if (family === 0 || !validPrefix || rest.length > 0) {
      throw new Error(
        `API_TRUST_PROXY must list proxy IP addresses or CIDR ranges (for example "127.0.0.1,::1"); "${entry}" is not one.`,
      );
    }
  }
  return entries;
}
