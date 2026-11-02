import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CreateLogDto } from './dto/create-log.dto';
import { ListLogsQueryDto } from './dto/list-logs-query.dto';
import { LogsService } from './logs.service';

@ApiTags('Logs')
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Post()
  @ApiOperation({ summary: 'Ingest one log entry' })
  create(@Body() dto: CreateLogDto) {
    return this.logsService.create(dto);
  }

  @Get()
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({ summary: 'List logs with filters and pagination' })
  @ApiQuery({ name: 'service', required: false })
  @ApiQuery({ name: 'level', required: false })
  @ApiQuery({ name: 'from', required: false, format: 'date-time' })
  @ApiQuery({ name: 'to', required: false, format: 'date-time' })
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 100 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  findAll(@Query() query: ListLogsQueryDto) {
    return this.logsService.findAll(query);
  }
}
