import { Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { ObjectId } from 'mongodb';
import { MongoRepository } from 'typeorm';

import { LogsService } from '../../logs/logs.service';
import { AnalysisEntity } from '../entities/analysis.entity';
import { AnalysisProviderRegistry } from '../providers/analysis-provider.registry';
import { AnalysisStatus } from '../enums/analysis-status.enum';
import { ANALYSIS_QUEUE_NAME } from '../constants/analysis-queue-name.const';
import { ANALYSIS_DEAD_LETTER_QUEUE_NAME } from '../constants/analysis-dead-letter-queue-name.const';
import { AnalysisJobDataInterface } from '../contracts';


@Processor(ANALYSIS_QUEUE_NAME)
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    @InjectRepository(AnalysisEntity)
    private readonly analysisRepository: MongoRepository<AnalysisEntity>,
    private readonly logsService: LogsService,
    private readonly providers: AnalysisProviderRegistry,
    @InjectQueue(ANALYSIS_DEAD_LETTER_QUEUE_NAME)
    private readonly deadLetterQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<AnalysisJobDataInterface>): Promise<void> {
    const objectId = new ObjectId(job.data.analysisId);
    const analysis = await this.analysisRepository.findOneBy(
      { _id: objectId },
    );
    if (!analysis) {
      throw new NotFoundException(
        `Analysis "${job.data.analysisId}" was not found`,
      );
    }

    analysis.status = AnalysisStatus.Processing;
    analysis.attempts = job.attemptsMade + 1;
    analysis.updatedAt = new Date();
    await this.analysisRepository.save(analysis);

    try {
      const logs = await this.logsService.findByIds(analysis.logIds);
      if (logs.length !== analysis.logIds.length) {
        throw new NotFoundException(
          'One or more logs for this analysis were not found',
        );
      }

      const { result, provider } = await this.providers.analyze(logs);
      analysis.status = AnalysisStatus.Completed;
      analysis.provider = provider;
      analysis.result = result;
      analysis.error = undefined;
      analysis.updatedAt = new Date();
      await this.analysisRepository.save(analysis);
    } catch (error) {
      analysis.updatedAt = new Date();
      await this.analysisRepository.save(analysis);
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async handleFailed(job: Job<AnalysisJobDataInterface> | undefined, error: Error) {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;

    const analysisId = job.data.analysisId;
    const objectId = new ObjectId(analysisId);
    const analysis = await this.analysisRepository.findOneBy(
      { _id: objectId },
    );
    if (analysis) {
      analysis.status = AnalysisStatus.Failed;
      analysis.error = 'Analysis failed after all provider retries';
      analysis.attempts = job.attemptsMade;
      analysis.updatedAt = new Date();
      await this.analysisRepository.save(analysis);
    }

    this.logger.error(
      `Analysis ${analysisId} exhausted ${job.attemptsMade} attempts`,
      error.stack,
    );
    try {
      await this.deadLetterQueue.add(
        'analysis-failed',
        {
          analysisId,
          attempts: job.attemptsMade,
          failedReason: error.message,
        },
        { jobId: analysisId },
      );
    } catch (deadLetterError) {
      this.logger.error(
        `Unable to enqueue analysis ${analysisId} in the dead-letter queue`,
        deadLetterError instanceof Error
          ? deadLetterError.stack
          : String(deadLetterError),
      );
    }
  }
}
