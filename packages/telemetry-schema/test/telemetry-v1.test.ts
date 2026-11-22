import { describe, expect, it } from 'vitest';

import { telemetryV1Schema, validTelemetryV1Example } from '../src/index.js';

describe('telemetryV1Schema', () => {
  it('accepts the version 1 example payload', () => {
    expect(telemetryV1Schema.parse(validTelemetryV1Example)).toEqual(validTelemetryV1Example);
  });

  it('rejects a payload missing required message identity', () => {
    const { message_id: _messageId, ...withoutMessageId } = validTelemetryV1Example;

    expect(telemetryV1Schema.safeParse(withoutMessageId).success).toBe(false);
  });

  it('rejects timestamps that are not explicitly UTC', () => {
    const invalidTimestamp = {
      ...validTelemetryV1Example,
      captured_at: '2026-01-01T07:00:00+07:00',
    };

    expect(telemetryV1Schema.safeParse(invalidTimestamp).success).toBe(false);
  });

  it('rejects unsupported MQ-5 ppm fields', () => {
    const invalidMq5 = {
      ...validTelemetryV1Example,
      readings: {
        ...validTelemetryV1Example.readings,
        mq5: {
          ...validTelemetryV1Example.readings.mq5,
          ppm: 250,
        },
      },
    };

    expect(telemetryV1Schema.safeParse(invalidMq5).success).toBe(false);
  });

  it('preserves null readings instead of coercing them to zero', () => {
    const result = telemetryV1Schema.parse(validTelemetryV1Example);

    expect(result.readings.ammonia_adc).toBeNull();
    expect(result.readings.water_flow_l_min).toBeNull();
  });
  // zod 4 (AUDIT S23): message_id keeps the zod 3 rule (any 8-4-4-4-12 hex id, z.guid()) instead of
  // z.uuid(), which would also demand RFC 9562 version and variant bits.
  it('accepts any hex GUID as message_id, also without RFC version and variant bits', () => {
    for (const message_id of [
      '12345678-1234-0234-c234-123456789abc',
      'B9F4F59A-64AF-4EF8-A477-87F62E398DD7',
      '00000000-0000-0000-0000-000000000000',
    ]) {
      expect(
        telemetryV1Schema.safeParse({ ...validTelemetryV1Example, message_id }).success,
        message_id,
      ).toBe(true);
    }
  });

  it('rejects a message_id that is not an 8-4-4-4-12 hex id', () => {
    for (const message_id of [
      '12345678123412341234123456789abc',
      '{b9f4f59a-64af-4ef8-a477-87f62e398dd7}',
      'g9f4f59a-64af-4ef8-a477-87f62e398dd7',
      '',
    ]) {
      expect(
        telemetryV1Schema.safeParse({ ...validTelemetryV1Example, message_id }).success,
        message_id,
      ).toBe(false);
    }
  });

  it('requires seconds in captured_at; fractions are optional (zod 4, S23)', () => {
    const parse = (captured_at: string) =>
      telemetryV1Schema.safeParse({ ...validTelemetryV1Example, captured_at }).success;
    expect(parse('2026-01-01T00:00:00Z')).toBe(true);
    expect(parse('2026-01-01T00:00:00.123456Z')).toBe(true);
    expect(parse('2026-01-01T00:00Z')).toBe(false);
  });

  it('rejects counters beyond the largest safe integer (zod 4 .int(), S23)', () => {
    const parse = (sequence_no: number) =>
      telemetryV1Schema.safeParse({ ...validTelemetryV1Example, sequence_no }).success;
    expect(parse(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(parse(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it('rejects non-finite sensor values', () => {
    const withTemperature = (raw: number) => ({
      ...validTelemetryV1Example,
      readings: { ...validTelemetryV1Example.readings, air_temperature_c: { raw, filtered: 28 } },
    });
    for (const raw of [Infinity, -Infinity, NaN]) {
      expect(telemetryV1Schema.safeParse(withTemperature(raw)).success, String(raw)).toBe(false);
    }
  });
});
