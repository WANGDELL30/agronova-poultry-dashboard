import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { VisionModule } from './vision/vision.module.js';

@Module({
  imports: [DatabaseModule, HealthModule, VisionModule],
})
export class AppModule {}
