import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { AnalysisIdParamDto } from './dto/analysis-id-param.dto';
import { AnalyzeLogsDto } from './dto/analyze-logs.dto';
import { ListAnalysesQueryDto } from './dto/list-analyses-query.dto';
import { AnalysesService } from './analyses.service';

@ApiTags('Analyses')
@Controller('logs')
export class AnalysesController {
  constructor(private readonly analysesService: AnalysesService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue an analysis for selected logs' })
  @ApiAcceptedResponse({ description: 'Analysis job accepted' })
  enqueue(@Body() dto: AnalyzeLogsDto) {
    return this.analysesService.enqueue(dto);
  }

  @Get('analysis')
  @ApiOperation({ summary: 'List analyses with filters and pagination' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['queued', 'processing', 'completed', 'failed'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 100 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  findAll(@Query() query: ListAnalysesQueryDto) {
    return this.analysesService.findAll(query);
  }

  @Get('analysis/:id')
  @ApiOperation({ summary: 'Get an analysis status and result' })
  findOne(@Param() params: AnalysisIdParamDto) {
    return this.analysesService.findOne(params.id);
  }
}
