import { BadRequestException, Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { telemetryV1Schema, type TelemetryReceiptV1 } from '@agronova/telemetry-schema';
import type { FastifyReply } from 'fastify';

import { TelemetryService } from './telemetry.service.js';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly service: TelemetryService) {}

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
    @Query('device_id') deviceId: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): TelemetryReceiptV1 | undefined {
    const receipt = this.service.latest(deviceId?.trim() || undefined);
    if (!receipt) {
      reply.status(204);
      return undefined;
    }
    return receipt;
  }
}
