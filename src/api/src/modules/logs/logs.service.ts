import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { MongoRepository } from 'typeorm';
import { Filter, ObjectId } from 'mongodb';

import { LogsServiceInterface } from 'src/common/contracts';
import { CreateLogDto } from './dto/create-log.dto';
import { ListLogsQueryDto } from './dto/list-logs-query.dto';
import { LogStatsQueryDto } from './dto/log-stats-query.dto';
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

  async getStats(query: LogStatsQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (from && to && from > to) {
      throw new BadRequestException('from must be earlier than or equal to to');
    }

    const match: Filter<LogEntity> = {};
    if (from || to) {
      match.timestamp = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const groupBy = query.groupBy;
    const pipeline = [
      { $match: match },
      { $group: { _id: `$${groupBy}`, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 100 },
    ];

    const cursor = this.logsRepository.aggregate(pipeline);
    const rows = (await cursor.toArray()) as Array<{
      _id: string;
      count: number;
    }>;
    const total = await this.logsRepository.countDocuments(match);

    return {
      groupBy,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      total,
      buckets: rows.map((row) => ({ key: String(row._id), count: row.count })),
    };
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
