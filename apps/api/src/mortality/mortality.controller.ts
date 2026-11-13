import {
  getModelStatus,
  modelInputsUnavailable,
  reportModelFailure,
} from '@agronova/mortality-model';
import {
  ConflictException,
  Controller,
  Get,
  Logger,
  Post,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

const logger = new Logger('MortalityController');

@Controller('mortality')
export class MortalityController {
  @Get('model')
  async model(@Res({ passthrough: true }) reply?: FastifyReply) {
    // Set before anything can throw, so the 503 is no-store too, like Vercel (K9).
    reply?.header('Cache-Control', 'no-store');
    try {
      return await getModelStatus();
    } catch (error) {
      reportModelFailure(error, (message) => logger.error(message)); // once per failure (H12)
      throw new ServiceUnavailableException({ code: 'MODEL_UNAVAILABLE' });
    }
  }

  @Post('diagnostics')
  diagnostics(): never {
    throw new ConflictException(modelInputsUnavailable);
  }

  @Post('predict')
  predict(): never {
    throw new ConflictException(modelInputsUnavailable);
  }
}
