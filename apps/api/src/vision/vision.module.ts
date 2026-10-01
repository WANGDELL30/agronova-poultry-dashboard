import { Module } from '@nestjs/common';

import { ImageStore } from './image-store.js';
import { InferenceClient } from './inference-client.js';
import { loadVisionConfig } from './vision-config.js';
import { VisionController } from './vision.controller.js';
import {
  InMemoryVisionRepository,
  VISION_REPOSITORY,
  type VisionRepository,
} from './vision.repository.js';
import { VisionService } from './vision.service.js';
import { VISION_CONFIG } from './vision.tokens.js';

@Module({
  controllers: [VisionController],
  providers: [
    { provide: VISION_CONFIG, useFactory: () => loadVisionConfig() },
    { provide: VISION_REPOSITORY, useClass: InMemoryVisionRepository },
    {
      provide: VisionService,
      inject: [VISION_REPOSITORY, VISION_CONFIG],
      useFactory: (repository: VisionRepository, config: ReturnType<typeof loadVisionConfig>) =>
        new VisionService(
          repository,
          new ImageStore(config.imageDir),
          new InferenceClient(
            config.inferenceUrl,
            config.inferenceTimeoutMs,
            config.inferenceApiKey,
          ),
        ),
    },
  ],
})
export class VisionModule {}
