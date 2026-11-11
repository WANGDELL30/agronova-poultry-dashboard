import type { TranslationKey } from '../i18n/translations';

/**
 * Maps a telemetry error kind to a localized, user-facing message. The technical English message
 * from TelemetrySourceError (e.g. "Telemetry API returned HTTP 500.") is only logged to the
 * console (AUDIT D13).
 */
export function telemetryErrorKey(kind: 'unavailable' | 'error'): TranslationKey {
  return kind === 'unavailable' ? 'telemetry.error.unavailable' : 'telemetry.error.invalid';
}
