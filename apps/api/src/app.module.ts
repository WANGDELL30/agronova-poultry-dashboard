import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { MortalityModule } from './mortality/mortality.module.js';

@Module({
  imports: [DatabaseModule, HealthModule, MortalityModule],
})
export class AppModule {}
