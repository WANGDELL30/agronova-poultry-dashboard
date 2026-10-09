import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { visionFrameMetadataSchema, type VisionResultV1 } from '@agronova/vision-schema';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ALLOWED_IMAGE_TYPES, type VisionConfig } from './vision-config.js';
import { VISION_CONFIG } from './vision.tokens.js';
import { VisionInferenceFailure, VisionService } from './vision.service.js';

@Controller('vision')
export class VisionController {
  constructor(
    @Inject(VisionService) private readonly service: VisionService,
    @Inject(VISION_CONFIG) private readonly config: VisionConfig,
  ) {}

  @Post('frames')
  async upload(@Req() request: FastifyRequest): Promise<VisionResultV1> {
    if (!request.isMultipart()) throw new BadRequestException('Expected multipart/form-data.');

    const fields: Record<string, string> = {};
    let image: { data: Buffer; mimeType: string } | null = null;
    for await (const part of request.parts({
      limits: { fileSize: this.config.maxImageBytes, files: 1 },
    })) {
      if (part.type === 'file') {
        if (part.fieldname !== 'image' || image)
          throw new BadRequestException('Exactly one "image" file is required.');
        if (!ALLOWED_IMAGE_TYPES[part.mimetype]) {
          throw new HttpException(
            'Only JPEG, PNG, or WebP images are accepted.',
            HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          );
        }
        let data: Buffer;
        try {
          data = await part.toBuffer();
        } catch (error) {
          if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
            throw new HttpException('Image exceeds the size limit.', HttpStatus.PAYLOAD_TOO_LARGE);
          }
          throw error;
        }
        image = { data, mimeType: part.mimetype };
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }
    if (!image) throw new BadRequestException('Exactly one "image" file is required.');

    const meta = visionFrameMetadataSchema.safeParse(fields);
    if (!meta.success) {
      throw new BadRequestException({ error: 'invalid_metadata', issues: meta.error.issues });
    }

    try {
      return await this.service.processFrame(meta.data, image.data, image.mimeType);
    } catch (error) {
      if (error instanceof VisionInferenceFailure) {
        const status =
          error.code === 'inference_timeout' ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY;
        throw new HttpException(
          { error: error.code, message: error.message, message_id: error.record.message_id },
          status,
        );
      }
      throw error;
    }
  }

  @Get('results')
  list(
    @Query('camera_id') cameraId?: string,
    @Query('limit') limit?: string,
  ): Promise<VisionResultV1[]> {
    const parsed = limit === undefined ? 20 : Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100.');
    }
    return this.service.list(cameraId || undefined, parsed);
  }

  @Get('results/:id/image')
  async image(@Param('id') id: string, @Res() reply: FastifyReply): Promise<void> {
    const image = await this.service.readImage(id);
    if (!image) throw new NotFoundException('Image not found.');
    await reply
      .header('Content-Type', image.mimeType)
      .header('Cache-Control', 'private, max-age=3600')
      .send(image.data);
  }

  @Get('health')
  health() {
    return this.service.health();
  }
}
