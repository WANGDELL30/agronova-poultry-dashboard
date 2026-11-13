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
  ServiceUnavailableException,
} from '@nestjs/common';

const logger = new Logger('MortalityController');

@Controller('mortality')
export class MortalityController {
  @Get('model')
  async model() {
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
