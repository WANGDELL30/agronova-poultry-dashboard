import { getModelStatus, modelInputsUnavailable } from '@agronova/mortality-model';
import {
  ConflictException,
  Controller,
  Get,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';

@Controller('mortality')
export class MortalityController {
  @Get('model')
  async model() {
    try {
      return await getModelStatus();
    } catch {
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
