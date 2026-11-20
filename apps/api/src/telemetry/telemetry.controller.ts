import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { telemetryV1Schema, type TelemetryReceiptV1 } from '@agronova/telemetry-schema';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { optionalIdQuery, parseQuery } from '../common/query.js';

import {
  DEVICE_KEY_HEADER,
  TELEMETRY_AUTH,
  deviceForKey,
  type TelemetryAuthConfig,
} from './device-keys.js';
import { DuplicateMessageIdError, TelemetryService } from './telemetry.service.js';

const latestQuerySchema = z.object({ device_id: optionalIdQuery });

@Controller('telemetry')
export class TelemetryController {
  constructor(
    @Inject(TelemetryService) private readonly service: TelemetryService,
    @Inject(TELEMETRY_AUTH) private readonly auth: TelemetryAuthConfig,
  ) {}

  @Post()
  ingest(
    @Body() body: unknown,
    @Headers(DEVICE_KEY_HEADER) deviceKey: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): TelemetryReceiptV1 {
    // Checked before the body: a caller without a valid key learns nothing about the schema.
    let authenticatedDevice: string | null = null;
    if (this.auth.deviceKeys) {
      authenticatedDevice = deviceForKey(this.auth.deviceKeys, deviceKey);
      if (authenticatedDevice === null) {
        throw new UnauthorizedException({
          error: 'invalid_device_key',
          message: 'A valid X-Device-Key header is required.',
        });
      }
    }
    const parsed = telemetryV1Schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_telemetry',
        issues: parsed.error.issues,
      });
    }
    // A key may only write its own device: a leaked key cannot overwrite another device.
    if (authenticatedDevice !== null && parsed.data.device_id !== authenticatedDevice) {
      throw new ForbiddenException({
        error: 'device_id_mismatch',
        message: 'The device_id does not belong to this device key.',
      });
    }
    try {
      const { receipt, replayed } = this.service.ingestOrReplay(parsed.data);
      if (replayed) reply.status(200); // retransmission: same receipt, nothing changed (R5)
      return receipt;
    } catch (error) {
      if (error instanceof DuplicateMessageIdError) {
        throw new ConflictException({
          error: 'duplicate_message_id',
          message: 'This message_id was already received with a different payload.',
        });
      }
      throw error;
    }
  }

  @Get('latest')
  latest(
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): TelemetryReceiptV1 | undefined {
    const { device_id: deviceId } = parseQuery(latestQuerySchema, query);
    const receipt = this.service.latest(deviceId);
    if (!receipt) {
      reply.status(204);
      return undefined;
    }
    return receipt;
  }
}
