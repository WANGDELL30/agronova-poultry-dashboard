import { Module } from '@nestjs/common';
import { MortalityController } from './mortality.controller.js';

@Module({ controllers: [MortalityController] })
export class MortalityModule {}
