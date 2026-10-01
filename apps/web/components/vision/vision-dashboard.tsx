'use client';

import type { VisionResultV1 } from '@agronova/vision-schema';
import { Camera } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';

import { formatDateTime } from '../../lib/formatting/formatters';
import { useLanguage } from '../../lib/i18n/language-provider';
import type { TranslationKey } from '../../lib/i18n/translations';
import { createVisionClient } from '../../lib/vision/create-vision-client';
import { VisionClientError, type VisionClient } from '../../lib/vision/vision-client';
import { SectionHeader } from '../ui/section-header';
import { VisionResultCard, VisionStatusBadge, VoteText } from './vision-result-card';

const KNOWN_ERRORS = new Set([
  'network',
  'inference_unreachable',
  'inference_timeout',
  'inference_not_ready',
  'inference_bad_response',
  'invalid_metadata',
]);

export function VisionDashboard({ client: injected }: Readonly<{ client?: VisionClient }>) {
  const { t, locale } = useLanguage();
  const client = useMemo(() => injected ?? createVisionClient(), [injected]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraId, setCameraId] = useState('cam-01');
  const [kandangId, setKandangId] = useState('');
  const [records, setRecords] = useState<VisionResultV1[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const refresh = useCallback(async () => {
    const list = await client.list();
    setRecords(list);
    return list;
  }, [client]);

  useEffect(() => {
    let active = true;
    client
      .list()
      .then((list) => active && setRecords(list))
      .catch((error: unknown) => active && setErrorKey(errorToKey(error)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [client]);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErrorKey('vision.error.noFile');
      return;
    }
    setSubmitting(true);
    setErrorKey(null);
    const modified = file.lastModified;
    const capturedAt = new Date(
      Math.min(Number.isFinite(modified) ? modified : Date.now(), Date.now()),
    );
    try {
      const record = await client.submit({
        file,
        cameraId: cameraId.trim(),
        kandangId: kandangId.trim() || undefined,
        capturedAt: capturedAt.toISOString(),
      });
      setSelectedId(record.message_id);
      if (fileRef.current) fileRef.current.value = '';
    } catch (error) {
      setErrorKey(errorToKey(error));
    } finally {
      // Also refresh on failure: the API stores failed attempts as inference_error records.
      await refresh().catch(() => undefined);
      setSubmitting(false);
    }
  }

  const selected = records.find((r) => r.message_id === selectedId) ?? records[0] ?? null;

  return (
    <div className="vision-page">
      <SectionHeader title={t('vision.title')} description={t('vision.description')} />

      {client.mode === 'mock' && (
        <p className="vision-banner" role="status">
          {t('vision.mock.banner')}
        </p>
      )}

      <form className="panel vision-form" onSubmit={onSubmit}>
        <label>
          {t('vision.form.camera')}
          <input
            required
            maxLength={64}
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
          />
        </label>
        <label>
          {t('vision.form.kandang')}
          <input maxLength={64} value={kandangId} onChange={(e) => setKandangId(e.target.value)} />
        </label>
        <label>
          {t('vision.form.image')}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
        <small>{t('vision.form.capturedAtNote')}</small>
        <button className="primary-button" type="submit" disabled={submitting}>
          <Camera size={16} aria-hidden="true" />
          {submitting ? t('vision.form.submitting') : t('vision.form.submit')}
        </button>
        {errorKey && (
          <p className="vision-error" role="alert">
            {t(errorKey)}
          </p>
        )}
      </form>

      {selected && <VisionResultCard record={selected} imageUrl={client.imageUrl(selected)} />}

      <section className="panel" aria-labelledby="vision-history">
        <h3 id="vision-history">{t('vision.history.title')}</h3>
        {loading ? (
          <p>{t('vision.loading')}</p>
        ) : records.length === 0 ? (
          <p>{t('vision.history.empty')}</p>
        ) : (
          <ul className="vision-history">
            {records.map((record) => (
              <li key={record.message_id}>
                <button
                  type="button"
                  aria-current={record.message_id === selected?.message_id}
                  onClick={() => setSelectedId(record.message_id)}
                >
                  <span>{formatDateTime(record.captured_at, locale)}</span>
                  <span>{record.camera_id}</span>
                  <VisionStatusBadge record={record} />
                  <span>
                    <VoteText record={record} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function errorToKey(error: unknown): TranslationKey {
  if (error instanceof VisionClientError && KNOWN_ERRORS.has(error.code)) {
    return `vision.error.${error.code}` as TranslationKey;
  }
  return 'vision.error.generic';
}
