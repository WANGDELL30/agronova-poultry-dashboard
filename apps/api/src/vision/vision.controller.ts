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
import {
  visionFrameMetadataSchema,
  type VisionApiErrorCode,
  type VisionResultV1,
} from '@agronova/vision-schema';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { limitQuery, optionalIdQuery, parseQuery } from '../common/query.js';

import { ALLOWED_IMAGE_TYPES, type VisionConfig } from './vision-config.js';

const resultsQuerySchema = z.object({ camera_id: optionalIdQuery, limit: limitQuery(20, 100) });

/** Seconds a client should wait before retrying while the model is still loading. */
export const NOT_READY_RETRY_AFTER_SECONDS = 30;

function apiError(code: VisionApiErrorCode, message: string, status: HttpStatus): HttpException {
  return new HttpException({ error: code, message }, status);
}
import { VISION_CONFIG } from './vision.tokens.js';
import { VisionInferenceFailure, VisionService } from './vision.service.js';

@Controller('vision')
export class VisionController {
  constructor(
    @Inject(VisionService) private readonly service: VisionService,
    @Inject(VISION_CONFIG) private readonly config: VisionConfig,
  ) {}

  @Post('frames')
  async upload(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<VisionResultV1> {
    if (!request.isMultipart()) throw new BadRequestException('Expected multipart/form-data.');

    const fields: Record<string, string> = {};
    let image: { data: Buffer; mimeType: string } | null = null;
    const exactlyOneImage = () =>
      apiError('image_required', 'Exactly one "image" file is required.', HttpStatus.BAD_REQUEST);
    try {
      for await (const part of request.parts({
        limits: { fileSize: this.config.maxImageBytes, files: 1 },
      })) {
        if (part.type === 'file') {
          if (part.fieldname !== 'image' || image) throw exactlyOneImage();
          if (!ALLOWED_IMAGE_TYPES[part.mimetype]) {
            throw apiError(
              'unsupported_image_type',
              'Only JPEG, PNG, or WebP images are accepted.',
              HttpStatus.UNSUPPORTED_MEDIA_TYPE,
            );
          }
          let data: Buffer;
          try {
            data = await part.toBuffer();
          } catch (error) {
            if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
              throw apiError(
                'image_too_large',
                `Image exceeds the size limit of ${this.config.maxImageBytes} bytes.`,
                HttpStatus.PAYLOAD_TOO_LARGE,
              );
            }
            throw error;
          }
          image = { data, mimeType: part.mimetype };
        } else if (typeof part.value === 'string') {
          fields[part.fieldname] = part.value;
        }
      }
    } catch (error) {
      // @fastify/multipart reports a second file as 413 "reach files limit"; it is a bad request.
      if ((error as { code?: string }).code === 'FST_FILES_LIMIT') throw exactlyOneImage();
      throw error;
    }
    if (!image) throw exactlyOneImage();
    // Checked before anything is stored or sent to inference (AUDIT R11).
    if (image.data.length === 0) {
      throw apiError('image_empty', 'The image file is empty.', HttpStatus.BAD_REQUEST);
    }

    const meta = visionFrameMetadataSchema.safeParse(fields);
    if (!meta.success) {
      const error: VisionApiErrorCode = 'invalid_metadata';
      throw new BadRequestException({ error, issues: meta.error.issues });
    }

    try {
      return await this.service.processFrame(meta.data, image.data, image.mimeType);
    } catch (error) {
      if (error instanceof VisionInferenceFailure) {
        if (error.code === 'inference_not_ready') {
          // Nothing was stored, so there is no message_id; the client may retry later.
          reply.header('Retry-After', String(NOT_READY_RETRY_AFTER_SECONDS));
          throw apiError(error.code, error.message, HttpStatus.SERVICE_UNAVAILABLE);
        }
        const status =
          error.code === 'inference_timeout' ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY;
        throw new HttpException(
          { error: error.code, message: error.message, message_id: error.record?.message_id },
          status,
        );
      }
      throw error;
    }
  }

  @Get('results')
  list(@Query() query: unknown): Promise<VisionResultV1[]> {
    const { camera_id: cameraId, limit } = parseQuery(resultsQuerySchema, query);
    return this.service.list(cameraId, limit);
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
