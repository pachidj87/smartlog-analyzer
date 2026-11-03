import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';

import { Filter, MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Queue } from 'bullmq';

import { LogsServiceInterface } from 'src/common/contracts';
import { AnalysisEntity } from './entities/analysis.entity';
import { AnalysisStatus } from './enums';
import { AnalyzeLogsDto } from './dto/analyze-logs.dto';
import { ListAnalysesQueryDto } from './dto/list-analyses-query.dto';
import { ListDeadLettersQueryDto } from './dto/list-dead-letters-query.dto';
import { ANALYSIS_DEAD_LETTER_QUEUE_NAME, ANALYSIS_QUEUE_NAME } from './constants';
import { LOGS_SERVICE } from './symbols';


export interface DeadLetterJob {
  id: string;
  analysisId: string;
  failedReason: string;
  attempts: number;
  createdAt: string;
}


@Injectable()
export class AnalysesService {
  private readonly logger = new Logger(AnalysesService.name);

  constructor(
    @InjectRepository(AnalysisEntity)
    private readonly analysesRepository: MongoRepository<AnalysisEntity>,
    @Inject(LOGS_SERVICE)
    private readonly logsService: LogsServiceInterface,
    @InjectQueue(ANALYSIS_QUEUE_NAME)
    private readonly analysisQueue: Queue,
    @InjectQueue(ANALYSIS_DEAD_LETTER_QUEUE_NAME)
    private readonly deadLetterQueue: Queue,
  ) {}

  async enqueue(dto: AnalyzeLogsDto) {
    const logs = await this.logsService.findByIds(dto.logIds);
    if (logs.length !== dto.logIds.length) {
      throw new NotFoundException('One or more requested logs were not found');
    }

    const now = new Date();
    const analysis = this.analysesRepository.create({
      logIds: dto.logIds,
      status: AnalysisStatus.Queued,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.analysesRepository.save(analysis);
    const id = saved._id.toHexString();

    try {
      await this.analysisQueue.add(
        'analyze-logs',
        { analysisId: id },
        { jobId: id },
      );
    } catch (error) {
      this.logger.error(
        `Unable to enqueue analysis ${id}`,
        error instanceof Error ? error.stack : String(error),
      );
      saved.status = AnalysisStatus.Failed;
      saved.error = 'The analysis could not be queued';
      saved.updatedAt = new Date();
      await this.analysesRepository.save(saved);
      throw new ServiceUnavailableException(
        'The analysis queue is unavailable',
      );
    }

    const result = {
      id,
      status: saved.status,
      createdAt: saved.createdAt.toISOString(),
    };

    return result;
  }

  async findAll(query: ListAnalysesQueryDto) {
    const where: Filter<AnalysisEntity> = query.status
      ? { status: query.status }
      : {};
    const [analyses, total] = await this.analysesRepository.findAndCount({
      where,
      skip: query.offset,
      take: query.limit,
      order: { createdAt: 'DESC' },
    });

    const items = analyses.map((analysis) => this.toResponse(analysis));
    return {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findDeadLetters(query: ListDeadLettersQueryDto) {
    const total = await this.deadLetterQueue.getWaitingCount();
    const jobs = await this.deadLetterQueue.getJobs(
      ['waiting'],
      query.offset,
      query.offset + query.limit - 1,
    );

    const items: DeadLetterJob[] = jobs.map((job) => ({
      id: String(job.id),
      analysisId: String(job.data.analysisId),
      failedReason: String(job.data.failedReason ?? 'unknown'),
      attempts: Number(job.data.attempts ?? 0),
      createdAt: new Date(job.timestamp).toISOString(),
    }));

    return {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async findOne(id: string) {    const objectId = new ObjectId(id);
    const analysis = await this.analysesRepository.findOneBy(
      { _id: objectId },
    );
    if (!analysis) {
      throw new NotFoundException(`Analysis "${id}" was not found`);
    }
    return this.toResponse(analysis);
  }

  private toResponse(analysis: AnalysisEntity) {
    const response = {
      id: analysis._id.toHexString(),
      logIds: analysis.logIds,
      status: analysis.status,
      ...(analysis.provider ? { provider: analysis.provider } : {}),
      ...(analysis.result ? { result: analysis.result } : {}),
      ...(analysis.error ? { error: analysis.error } : {}),
      attempts: analysis.attempts,
      createdAt: analysis.createdAt.toISOString(),
      updatedAt: analysis.updatedAt.toISOString(),
    };
    return response;
  }
}
