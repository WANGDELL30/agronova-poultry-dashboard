import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { telemetryV1Schema, type TelemetryReceiptV1 } from '@agronova/telemetry-schema';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';

import { optionalIdQuery, parseQuery } from '../common/query.js';

import { DuplicateMessageIdError, TelemetryService } from './telemetry.service.js';

const latestQuerySchema = z.object({ device_id: optionalIdQuery });

@Controller('telemetry')
export class TelemetryController {
  constructor(@Inject(TelemetryService) private readonly service: TelemetryService) {}

  @Post()
  ingest(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): TelemetryReceiptV1 {
    const parsed = telemetryV1Schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_telemetry',
        issues: parsed.error.issues,
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
