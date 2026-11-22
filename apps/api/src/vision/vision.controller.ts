import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  CAPTURED_AT_MAX_FUTURE_MS,
  isCapturedInFuture,
  visionFrameMetadataSchema,
  type VisionApiErrorCode,
  type VisionResultV1,
} from '@agronova/vision-schema';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { limitQuery, optionalIdQuery, parseQuery } from '../common/query.js';

import { matchesImageSignature } from './image-signature.js';
import {
  CAMERA_KEY_HEADER,
  UNLIMITED_UPLOAD_POLICY,
  UploadLimiter,
  authenticateUpload,
  type UploadPolicy,
} from './upload-policy.js';
import { ALLOWED_IMAGE_TYPES, type VisionConfig } from './vision-config.js';

const logger = new Logger('VisionController');

const resultsQuerySchema = z.object({ camera_id: optionalIdQuery, limit: limitQuery(20, 100) });

/** Seconds a client should wait before retrying while the model is still loading. */
export const NOT_READY_RETRY_AFTER_SECONDS = 30;
/** Matches the inference queue_full Retry-After: about one inference on a T4 (R1). */
export const BUSY_RETRY_AFTER_SECONDS = 15;

/**
 * The form carries exactly camera_id, kandang_id and captured_at plus one image (AUDIT S7). Without
 * these limits busboy accepts up to 1000 parts of 1 MB text each, all held in memory before
 * validation. A camera_id or kandang_id is at most 64 characters and captured_at about 24.
 */
export const MULTIPART_FIELD_LIMITS = {
  fields: 3,
  fieldSize: 256,
  fieldNameSize: 32,
  parts: 4,
} as const;

function apiError(code: VisionApiErrorCode, message: string, status: HttpStatus): HttpException {
  return new HttpException({ error: code, message }, status);
}
import { StorageUnavailableError } from './image-store.js';
import { VISION_CONFIG, VISION_UPLOAD_POLICY } from './vision.tokens.js';
import { VisionInferenceFailure, VisionService } from './vision.service.js';

@Controller('vision')
export class VisionController {
  private readonly policy: UploadPolicy;
  private readonly limiter: UploadLimiter;

  constructor(
    @Inject(VisionService) private readonly service: VisionService,
    @Inject(VISION_CONFIG) private readonly config: VisionConfig,
    // VisionModule always provides it; modules built only for tests may omit it (no limits).
    @Optional() @Inject(VISION_UPLOAD_POLICY) policy?: UploadPolicy,
  ) {
    this.policy = policy ?? UNLIMITED_UPLOAD_POLICY;
    this.limiter = new UploadLimiter(this.policy);
  }

  @Post('frames')
  async upload(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<VisionResultV1> {
    if (!request.isMultipart()) throw new BadRequestException('Expected multipart/form-data.');

    // Decided from the header alone, before the body is read (AUDIT S2).
    const header = request.headers[CAMERA_KEY_HEADER];
    const auth = authenticateUpload(this.policy, Array.isArray(header) ? header[0] : header);
    if (auth.kind === 'invalid_key') {
      // The body was not read: close the connection instead of leaving it half-consumed (R3).
      reply.header('Connection', 'close');
      throw apiError(
        'invalid_camera_key',
        'The X-Camera-Key header is not a valid camera key.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const fields: Record<string, string> = {};
    let image: { data: Buffer; mimeType: string } | null = null;
    const exactlyOneImage = () =>
      apiError('image_required', 'Exactly one "image" file is required.', HttpStatus.BAD_REQUEST);
    // A rejected file is not thrown right away: the rest of the body is drained first, otherwise
    // the unread bytes block the next request on the same keep-alive connection (AUDIT R3).
    let rejection: HttpException | null = null;
    try {
      for await (const part of request.parts({
        limits: { ...MULTIPART_FIELD_LIMITS, fileSize: this.config.maxImageBytes, files: 1 },
      })) {
        if (part.type === 'file') {
          if (!rejection && (part.fieldname !== 'image' || image)) rejection = exactlyOneImage();
          if (!rejection && !ALLOWED_IMAGE_TYPES[part.mimetype]) {
            rejection = apiError(
              'unsupported_image_type',
              'Only JPEG, PNG, or WebP images are accepted.',
              HttpStatus.UNSUPPORTED_MEDIA_TYPE,
            );
          }
          if (rejection) {
            part.file.resume();
            continue;
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
          // busboy cuts an oversized field silently; a cut value must never reach validation (S7).
          if (!rejection && (part.valueTruncated || part.fieldnameTruncated)) {
            rejection = apiError(
              'invalid_metadata',
              'A form field is longer than allowed.',
              HttpStatus.BAD_REQUEST,
            );
          }
          fields[part.fieldname] = part.value;
        }
      }
    } catch (error) {
      // The multipart iterator itself failed, so the rest of the body cannot be drained here:
      // close the connection after the error response instead of leaving it hanging (AUDIT R3).
      reply.header('Connection', 'close');
      // @fastify/multipart reports a second file as 413 "reach files limit"; it is a bad request.
      const code = (error as { code?: string }).code;
      if (code === 'FST_FILES_LIMIT') throw exactlyOneImage();
      if (code === 'FST_FIELDS_LIMIT' || code === 'FST_PARTS_LIMIT') {
        throw apiError(
          'invalid_metadata',
          'Only camera_id, kandang_id, captured_at and one image are accepted.',
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    }
    if (rejection) throw rejection;
    if (!image) throw exactlyOneImage();
    // Checked before anything is stored or sent to inference (AUDIT R11).
    if (image.data.length === 0) {
      throw apiError('image_empty', 'The image file is empty.', HttpStatus.BAD_REQUEST);
    }
    // The mimetype is the client's claim; the file must start with that type's signature (S11).
    if (!matchesImageSignature(image.data, image.mimeType)) {
      throw apiError(
        'unsupported_image_type',
        'The file content is not a JPEG, PNG, or WebP image of the declared type.',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const meta = visionFrameMetadataSchema.safeParse(fields);
    if (!meta.success) {
      const error: VisionApiErrorCode = 'invalid_metadata';
      throw new BadRequestException({ error, issues: meta.error.issues });
    }

    const now = Date.now();
    // A future captured_at would sort after every real frame in the voting window (AUDIT R8).
    if (isCapturedInFuture(meta.data.captured_at, now)) {
      const error: VisionApiErrorCode = 'invalid_metadata';
      throw new BadRequestException({
        error,
        issues: [
          {
            path: ['captured_at'],
            message: `must not be more than ${CAPTURED_AT_MAX_FUTURE_MS / 60_000} minutes in the future`,
          },
        ],
      });
    }
    let source: 'camera' | 'manual';
    if (auth.kind === 'camera') {
      if (meta.data.camera_id !== auth.cameraId) {
        throw apiError(
          'camera_id_mismatch',
          'The camera_id does not belong to this camera key.',
          HttpStatus.FORBIDDEN,
        );
      }
      this.admitOrThrow(reply, this.limiter.admitCamera(auth.cameraId, now));
      source = 'camera';
    } else {
      // request.ip is the real client behind cloudflared when API_TRUST_PROXY is set (D17).
      this.admitOrThrow(reply, this.limiter.admitKeyless(request.ip, now));
      // Without configured keys there is no way to tell cameras apart: keep today's behaviour.
      source = this.policy.cameraKeys === null ? 'camera' : 'manual';
    }

    try {
      return await this.service.processFrame(meta.data, image.data, image.mimeType, source);
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        // Generic message to the client; the cause goes to the log only.
        logger.error(error.message);
        throw apiError(
          'storage_unavailable',
          'The frame could not be stored. Try again later.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (error instanceof VisionInferenceFailure) {
        if (error.code === 'inference_not_ready' || error.code === 'inference_busy') {
          // Nothing was stored, so there is no message_id; the client may retry later.
          reply.header(
            'Retry-After',
            String(
              error.code === 'inference_busy'
                ? BUSY_RETRY_AFTER_SECONDS
                : NOT_READY_RETRY_AFTER_SECONDS,
            ),
          );
          throw apiError(error.code, error.message, HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (error.code === 'inference_unavailable') {
          // Nothing was stored. No Retry-After: the model failed to load and needs a restart (H11).
          throw apiError(error.code, error.message, HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (error.code === 'image_too_large') {
          throw apiError(error.code, error.message, HttpStatus.PAYLOAD_TOO_LARGE);
        }
        const status =
          error.code === 'inference_timeout'
            ? HttpStatus.GATEWAY_TIMEOUT
            : error.code === 'inference_gpu_oom'
              ? HttpStatus.SERVICE_UNAVAILABLE
              : HttpStatus.BAD_GATEWAY;
        throw new HttpException(
          { error: error.code, message: error.message, message_id: error.record?.message_id },
          status,
        );
      }
      throw error;
    }
  }

  private admitOrThrow(
    reply: FastifyReply,
    decision: { ok: true } | { ok: false; retryAfterSeconds: number },
  ): void {
    if (decision.ok) return;
    reply.header('Retry-After', String(decision.retryAfterSeconds));
    throw apiError(
      'upload_rate_limited',
      'Too many uploads. Try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
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
      // Never let a browser sniff the stored bytes into another type (S11).
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', 'inline')
      .header('Cache-Control', 'private, max-age=3600')
      .send(image.data);
  }

  @Get('health')
  health() {
    return this.service.health();
  }
}
