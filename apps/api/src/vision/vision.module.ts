import { Logger, Module } from '@nestjs/common';

import { ImageStore } from './image-store.js';
import { InferenceClient } from './inference-client.js';
import { loadUploadPolicy, type UploadPolicy } from './upload-policy.js';
import { loadVisionConfig } from './vision-config.js';
import { VisionController } from './vision.controller.js';
import {
  InMemoryVisionRepository,
  VISION_REPOSITORY,
  type VisionRepository,
} from './vision.repository.js';
import { VisionService } from './vision.service.js';
import { VISION_CONFIG, VISION_UPLOAD_POLICY } from './vision.tokens.js';

@Module({
  controllers: [VisionController],
  providers: [
    { provide: VISION_CONFIG, useFactory: () => loadVisionConfig() },
    {
      provide: VISION_UPLOAD_POLICY,
      useFactory: (): UploadPolicy => {
        const policy = loadUploadPolicy();
        if (policy.cameraKeys === null) {
          new Logger('VisionModule').warn(
            'VISION_CAMERA_KEYS is empty: every upload counts as a camera frame and can raise a ' +
              'stress alert. Uploads are still rate limited per IP. Set camera keys before cameras ' +
              'or the public dashboard reach the API.',
          );
        }
        return policy;
      },
    },
    {
      provide: VISION_REPOSITORY,
      inject: [VISION_UPLOAD_POLICY],
      useFactory: (policy: UploadPolicy) =>
        new InMemoryVisionRepository({
          camera: policy.maxCameraRecords,
          manual: policy.maxManualRecords,
        }),
    },
    {
      provide: VisionService,
      inject: [VISION_REPOSITORY, VISION_CONFIG],
      useFactory: async (
        repository: VisionRepository,
        config: ReturnType<typeof loadVisionConfig>,
      ) => {
        const images = new ImageStore(config.imageDir);
        await images.ensureWritable(); // fail fast at startup instead of 500 on every upload (H9)
        return new VisionService(
          repository,
          images,
          new InferenceClient(
            config.inferenceUrl,
            config.inferenceTimeoutMs,
            config.inferenceApiKey,
            config.inferenceHealthTimeoutMs,
          ),
        );
      },
    },
  ],
})
export class VisionModule {}
