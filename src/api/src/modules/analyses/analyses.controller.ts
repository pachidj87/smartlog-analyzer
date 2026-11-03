import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { AnalysisIdParamDto } from './dto/analysis-id-param.dto';
import { ListAnalysesQueryDto } from './dto/list-analyses-query.dto';
import { ListDeadLettersQueryDto } from './dto/list-dead-letters-query.dto';
import { AnalysesService } from './analyses.service';

@ApiTags('Analyses')
@Controller('analysis')
export class AnalysesController {
  constructor(private readonly analysesService: AnalysesService) {}

  @Get()
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

  @Get('dead-letter')
  @ApiOperation({ summary: 'List analyses that exhausted every retry' })
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 100 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  findDeadLetters(@Query() query: ListDeadLettersQueryDto) {
    return this.analysesService.findDeadLetters(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an analysis status and result' })
  findOne(@Param() params: AnalysisIdParamDto) {
    return this.analysesService.findOne(params.id);
  }
}
