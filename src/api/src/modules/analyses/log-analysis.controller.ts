import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AnalysesService } from './analyses.service';
import { AnalyzeLogsDto } from './dto/analyze-logs.dto';

@ApiTags('Analyses')
@Controller('logs')
export class LogAnalysisController {
  constructor(private readonly analysesService: AnalysesService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue an analysis for selected logs' })
  @ApiAcceptedResponse({ description: 'Analysis job accepted' })
  enqueue(@Body() dto: AnalyzeLogsDto) {
    return this.analysesService.enqueue(dto);
  }
}
