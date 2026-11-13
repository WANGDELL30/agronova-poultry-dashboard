import { validTelemetryV1Example } from '@agronova/telemetry-schema';
import { describe, expect, it } from 'vitest';

import { createSnapshotCsv, createSnapshotJson } from './snapshot-export';
import type { DashboardSnapshot } from './types';

const NOW = Date.parse('2026-01-01T00:01:00.000Z');

function snapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    telemetry: structuredClone(validTelemetryV1Example),
    received_at: '2026-01-01T00:00:59.000Z',
    last_seen_at: '2026-01-01T00:00:59.000Z',
    deviceOnline: true,
    stale: false,
    history: [],
    alerts: [],
    installedSensorCount: 0,
    calibratingSensorCount: 0,
    disconnectedSensorCount: 0,
    scenario: null,
    ...overrides,
  };
}

/** Minimal RFC 4180 parser: returns the raw cell text (with quotes) and the parsed value. */
function parseCsv(csv: string) {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let i = 0;
  while (i < csv.length) {
    const start = i;
    let value = '';
    if (csv[i] === '"') {
      i += 1;
      while (i < csv.length) {
        if (csv[i] === '"' && csv[i + 1] === '"') {
          value += '"';
          i += 2;
        } else if (csv[i] === '"') {
          i += 1;
          break;
        } else {
          value += csv[i];
          i += 1;
        }
      }
    } else {
      while (i < csv.length && csv[i] !== ',' && csv[i] !== '\n') {
        value += csv[i];
        i += 1;
      }
    }
    row.push({ raw: csv.slice(start, i), value });
    if (csv[i] === ',') {
      i += 1;
    } else {
      rows.push(row);
      row = [];
      i += 1;
    }
  }
  return rows;
}

type Cell = { raw: string; value: string };

/** Returns a lookup of CSV cells by column name; an unknown column fails the test. */
function csvRecord(snap: DashboardSnapshot): (column: string) => Cell {
  const [header = [], values = []] = parseCsv(createSnapshotCsv(snap, NOW));
  return (column) => {
    const cell = values[header.findIndex((name) => name.value === column)];
    if (!cell) throw new Error(`no CSV column ${column}`);
    return cell;
  };
}

describe('snapshot CSV export (AUDIT D14)', () => {
  it('includes quality and calibration columns', () => {
    const record = csvRecord(snapshot());
    expect(record('quality_overall').value).toBe('VALID');
    expect(record('quality_ammonia').value).toBe('NOT_INSTALLED');
    expect(record('quality_feed_weight').value).toBe('NOT_INSTALLED');
    expect(record('calibration_ds18b20').value).toBe('IN_PROGRESS');
    expect(record('calibration_mq5').value).toBe('IN_PROGRESS');
    expect(record('calibration_dht22').value).toBe('UNCALIBRATED');
  });

  it('neutralizes a formula in a string cell', () => {
    const snap = snapshot();
    snap.telemetry.device_id = '=HYPERLINK("https://evil.example","x")';
    expect(csvRecord(snap)('device_id').value).toBe('\'=HYPERLINK("https://evil.example","x")');

    for (const prefix of ['+', '-', '@', '\t', '\r']) {
      snap.telemetry.device_id = `${prefix}SUM(A1)`;
      expect(csvRecord(snap)('device_id').value).toBe(`'${prefix}SUM(A1)`);
    }
  });

  it('keeps negative numbers numeric', () => {
    const snap = snapshot();
    snap.telemetry.readings.air_temperature_c = { raw: -40, filtered: -39.5 };
    const record = csvRecord(snap);
    expect(record('air_temperature_raw_c').raw).toBe('-40');
    expect(record('air_temperature_filtered_c').raw).toBe('-39.5');
  });

  it('quotes a cell that contains a carriage return', () => {
    const snap = snapshot();
    snap.telemetry.device_id = 'A\rB';
    const cell = csvRecord(snap)('device_id');
    expect(cell.raw).toBe('"A\rB"');
    expect(cell.value).toBe('A\rB');
  });
});

describe('snapshot export device_online (AUDIT H3 follow-up a)', () => {
  const silent = snapshot({ last_seen_at: '2026-01-01T00:00:00.000Z' });
  const stale = snapshot({ stale: true });

  it('uses the client-side status in CSV', () => {
    expect(csvRecord(snapshot())('device_online').value).toBe('true');
    expect(csvRecord(silent)('device_online').value).toBe('false');
    expect(csvRecord(stale)('device_online').value).toBe('false');
  });

  it('uses the client-side status in JSON', () => {
    expect(JSON.parse(createSnapshotJson(snapshot(), NOW)).device_online).toBe(true);
    expect(JSON.parse(createSnapshotJson(silent, NOW)).device_online).toBe(false);
    expect(JSON.parse(createSnapshotJson(stale, NOW)).device_online).toBe(false);
  });
});
