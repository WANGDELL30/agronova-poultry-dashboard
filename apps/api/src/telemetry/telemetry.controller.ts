import {
  BadRequestException,
  Body,
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

import { TelemetryService } from './telemetry.service.js';

const latestQuerySchema = z.object({ device_id: optionalIdQuery });

@Controller('telemetry')
export class TelemetryController {
  constructor(@Inject(TelemetryService) private readonly service: TelemetryService) {}

  @Post()
  ingest(@Body() body: unknown): TelemetryReceiptV1 {
    const parsed = telemetryV1Schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_telemetry',
        issues: parsed.error.issues,
      });
    }
    return this.service.ingest(parsed.data);
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
