'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatChartTime, formatDateTime, formatNumber } from '../../lib/formatting/formatters';
import { useLanguage } from '../../lib/i18n/language-provider';
import type { TranslationKey } from '../../lib/i18n/translations';
import type { TrendMetric, TrendPoint } from '../../lib/telemetry/types';
import { EmptyState } from '../ui/data-states';
import { SectionHeader } from '../ui/section-header';

interface MetricConfig {
  key: TrendMetric;
  labelKey: TranslationKey;
  unit: string;
  digits: number;
}

const metrics: MetricConfig[] = [
  { key: 'air_temperature_c', labelKey: 'trend.airTemperature', unit: '°C', digits: 1 },
  { key: 'air_humidity_pct', labelKey: 'trend.airHumidity', unit: '%', digits: 1 },
  { key: 'water_temperature_c', labelKey: 'trend.waterTemperature', unit: '°C', digits: 1 },
  { key: 'mq5_relative_level_pct', labelKey: 'trend.mq5', unit: '% rel.', digits: 1 },
];

export function TrendChart({ history }: Readonly<{ history: TrendPoint[] }>) {
  const { locale, t } = useLanguage();
  const [metricKey, setMetricKey] = useState<TrendMetric>('air_temperature_c');
  const [showRaw, setShowRaw] = useState(false);
  const metric = metrics.find(({ key }) => key === metricKey) ?? metrics[0]!;

  const data = useMemo(
    () =>
      history.map((point) => ({
        captured_at: point.captured_at,
        filtered: point[metricKey]?.filtered ?? null,
        raw: point[metricKey]?.raw ?? null,
      })),
    [history, metricKey],
  );

  const hasData = data.some(({ filtered }) => filtered !== null);
  const metricLabel = t(metric.labelKey);

  return (
    <section className="panel trend-panel">
      <SectionHeader
        title={t('trend.title')}
        description={t('trend.description')}
        action={
          <label className="raw-toggle">
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(event) => setShowRaw(event.target.checked)}
            />
            <span aria-hidden="true" />
            {t('trend.showRaw')}
          </label>
        }
      />

      <div className="metric-tabs" role="tablist" aria-label={t('trend.title')}>
        {metrics.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={metricKey === item.key}
            className={metricKey === item.key ? 'is-active' : undefined}
            onClick={() => setMetricKey(item.key)}
            key={item.key}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {!hasData ? (
        <EmptyState compact />
      ) : (
        <>
          <div
            className="chart-wrap"
            role="img"
            aria-label={t('trend.chartLabel', { metric: metricLabel })}
          >
            <ResponsiveContainer width="100%" height="100%" debounce={80}>
              <LineChart data={data} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#e5eae5" strokeDasharray="4 5" vertical={false} />
                <XAxis
                  dataKey="captured_at"
                  tickFormatter={(value: string) => formatChartTime(value, locale)}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                  tick={{ fill: '#66736b', fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tick={{ fill: '#66736b', fontSize: 11 }}
                  tickFormatter={(value: number) => `${formatNumber(value, locale, metric.digits)}`}
                  domain={['auto', 'auto']}
                  unit={` ${metric.unit}`}
                />
                <Tooltip
                  labelFormatter={(label) => formatDateTime(String(label), locale)}
                  formatter={(value, name) => [
                    `${formatNumber(Number(value), locale, metric.digits)} ${metric.unit}`,
                    name === 'raw' ? t('trend.rawSeries') : t('trend.filteredSeries'),
                  ]}
                  contentStyle={{
                    border: '1px solid #dce4dd',
                    borderRadius: '10px',
                    boxShadow: '0 12px 30px rgba(24, 54, 35, 0.12)',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  iconType="plainline"
                  formatter={(value: string) =>
                    value === 'raw' ? t('trend.rawSeries') : t('trend.filteredSeries')
                  }
                  wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="filtered"
                  stroke="#1f7a4d"
                  strokeWidth={2.4}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {showRaw && (
                  <Line
                    type="monotone"
                    dataKey="raw"
                    stroke="#9aa69e"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <table className="sr-only">
            <caption>{t('trend.chartLabel', { metric: metricLabel })}</caption>
            <thead>
              <tr>
                <th>{t('device.lastSeen')}</th>
                <th>{t('trend.filteredSeries')}</th>
                {showRaw && <th>{t('trend.rawSeries')}</th>}
              </tr>
            </thead>
            <tbody>
              {data.slice(-6).map((point) => (
                <tr key={point.captured_at}>
                  <td>{formatDateTime(point.captured_at, locale)}</td>
                  <td>
                    {point.filtered === null
                      ? '—'
                      : `${formatNumber(point.filtered, locale, metric.digits)} ${metric.unit}`}
                  </td>
                  {showRaw && (
                    <td>
                      {point.raw === null
                        ? '—'
                        : `${formatNumber(point.raw, locale, metric.digits)} ${metric.unit}`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
