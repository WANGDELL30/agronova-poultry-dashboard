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
});
