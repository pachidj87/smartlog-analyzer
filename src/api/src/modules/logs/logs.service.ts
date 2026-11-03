import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { MongoRepository } from 'typeorm';
import { Filter, ObjectId } from 'mongodb';

import { LogsServiceInterface } from 'src/common/contracts';
import { CreateLogDto } from './dto/create-log.dto';
import { ListLogsQueryDto } from './dto/list-logs-query.dto';
import { LogEntity } from './entities/log.entity';


@Injectable()
export class LogsService implements LogsServiceInterface {
  constructor(
    @InjectRepository(LogEntity)
    private readonly logsRepository: MongoRepository<LogEntity>,
  ) {}

  async create(dto: CreateLogDto) {
    const log = this.logsRepository.create({
      ...dto,
      timestamp: new Date(dto.timestamp),
      ingestedAt: new Date(),
    });
    const saved = await this.logsRepository.save(log);

    return this.toResponse(saved);
  }

  async findByIds(ids: string[]) {
    const objectIds = ids.map((id) => new ObjectId(id));
    const results = await this.logsRepository.findBy({ _id: { $in: objectIds } });
    return results;
  }

  async findAll(query: ListLogsQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (from && to && from > to) {
      throw new BadRequestException('from must be earlier than or equal to to');
    }

    const where: Filter<LogEntity> = {};
    if (query.service) where.service = query.service;
    if (query.level) where.level = query.level;
    if (from || to) {
      where.timestamp = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const [logs, total] = await this.logsRepository.findAndCount({
      where,
      skip: query.offset,
      take: query.limit,
      order: { timestamp: 'DESC' },
    });

    const items = logs.map((log) => this.toResponse(log));
    const response = {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
    };

    return response;
  }

  private toResponse(log: LogEntity) {
    const response = {
      id: log._id.toHexString(),
      service: log.service,
      timestamp: log.timestamp.toISOString(),
      level: log.level,
      message: log.message,
      ...(log.metadata ? { metadata: log.metadata } : {}),
      ingestedAt: log.ingestedAt.toISOString(),
    };

    return response;
  }
}
