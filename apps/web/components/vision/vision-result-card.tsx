'use client';

import { SCS_INDICATOR_KEYS, type VisionResultV1 } from '@agronova/vision-schema';
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  ImageOff,
  ServerCrash,
  ShieldAlert,
} from 'lucide-react';

import { formatDateTime, formatNumber } from '../../lib/formatting/formatters';
import { useLanguage } from '../../lib/i18n/language-provider';

const statusIcon = {
  classified: CircleCheck,
  skipped_quality: ImageOff,
  parse_error: CircleHelp,
  inference_error: ServerCrash,
} as const;

/** Tone is per status/label so a missing result is never styled like `not_stress`. */
export function visionTone(record: VisionResultV1): 'ok' | 'danger' | 'neutral' | 'warn' {
  if (record.status !== 'classified')
    return record.status === 'skipped_quality' ? 'neutral' : 'warn';
  if (record.result?.label === 'stress') return 'danger';
  return record.result?.label === 'not_stress' ? 'ok' : 'neutral';
}

export function VisionStatusBadge({ record }: Readonly<{ record: VisionResultV1 }>) {
  const { t } = useLanguage();
  const Icon = record.result?.label === 'stress' ? CircleAlert : statusIcon[record.status];
  const text =
    record.status === 'classified' && record.result
      ? t(`vision.label.${record.result.label}`)
      : t(`vision.status.${record.status}`);
  return (
    <span className={`vision-badge vision-${visionTone(record)}`}>
      <Icon size={14} aria-hidden="true" />
      {text}
    </span>
  );
}

export function VoteText({ record }: Readonly<{ record: VisionResultV1 }>) {
  const { t } = useLanguage();
  const { vote } = record;
  return (
    <>
      {t(`vision.vote.${vote.status}`, { filled: vote.window_filled, size: vote.window_size })}
      {vote.majority_label !== null && vote.majority_count !== null
        ? ` (${t(`vision.label.${vote.majority_label}`)} ${vote.majority_count}/${vote.window_size})`
        : ''}
    </>
  );
}

export function VisionResultCard({
  record,
  imageUrl,
}: Readonly<{ record: VisionResultV1; imageUrl: string | null }>) {
  const { t, locale } = useLanguage();
  const { result } = record;

  return (
    <article className="panel vision-result" aria-live="polite">
      {imageUrl && <img className="vision-photo" src={imageUrl} alt={t('vision.image.alt')} />}
      <div className="vision-result-body">
        <div className="vision-result-head">
          <VisionStatusBadge record={record} />
          {record.vote.trigger_alert && (
            <span className="vision-badge vision-danger">
              <ShieldAlert size={14} aria-hidden="true" />
              {t('vision.vote.alert')}
            </span>
          )}
        </div>

        <dl className="vision-facts">
          <div>
            <dt>{t('vision.field.capturedAt')}</dt>
            <dd>{formatDateTime(record.captured_at, locale)}</dd>
          </div>
          <div>
            <dt>{t('vision.field.receivedAt')}</dt>
            <dd>{formatDateTime(record.received_at, locale)}</dd>
          </div>
          <div>
            <dt>{t('vision.field.quality')}</dt>
            <dd>
              {record.quality
                ? [
                    t(`vision.quality.${record.quality.status}`),
                    ...record.quality.issues.map((issue) => t(`vision.issue.${issue}`)),
                  ].join(' · ')
                : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('vision.field.vote')}</dt>
            <dd>
              <VoteText record={record} />
            </dd>
          </div>
          {result && (
            <>
              <div>
                <dt>{t('vision.field.score')}</dt>
                <dd>{formatNumber(result.score_stress, locale, 2)}</dd>
              </div>
              <div>
                <dt>{t('vision.field.confidence')}</dt>
                <dd>
                  {result.confidence === null
                    ? t('vision.field.confidenceNone')
                    : formatNumber(result.confidence, locale, 2)}
                </dd>
              </div>
            </>
          )}
          {record.model && (
            <div>
              <dt>{t('vision.field.model')}</dt>
              <dd>
                {record.model.adapter} ({record.inference_mode})
              </dd>
            </div>
          )}
        </dl>

        {result ? (
          <section
            aria-label={t('vision.field.indicators', {
              ya: result.total_ya,
              visible: result.visible_count,
            })}
          >
            <h3>
              {t('vision.field.indicators', { ya: result.total_ya, visible: result.visible_count })}
            </h3>
            <ul className="vision-indicators">
              {SCS_INDICATOR_KEYS.map((key) => (
                <li key={key} className={`answer-${result.indicators[key].toLowerCase()}`}>
                  <span>{t(`vision.indicator.${key}`)}</span>
                  <strong>{t(`vision.answer.${result.indicators[key]}`)}</strong>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="vision-no-result">{t('vision.field.noResult')}</p>
        )}

        {record.error_message && (
          <p className="vision-error-detail">
            {t('vision.field.error')}: {record.error_message}
          </p>
        )}
        {record.raw_response && (
          <details>
            <summary>{t('vision.field.rawResponse')}</summary>
            <pre>{record.raw_response}</pre>
          </details>
        )}
      </div>
    </article>
  );
}
