import { Logger } from '@nestjs/common';
import { ObjectId } from 'mongodb';

import { AnalysisProcessor } from '../../src/api/src/modules/analyses/processors/analysis.processor';

describe('AnalysisProcessor.handleFailed', () => {
  const analysisId = '507f1f77bcf86cd799439011';

  const buildProcessor = () => {
    const analysis = {
      _id: new ObjectId(analysisId),
      logIds: ['507f1f77bcf86cd799439012'],
      status: 'processing',
      attempts: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(analysis),
      save: jest.fn().mockResolvedValue(analysis),
    };
    const deadLetterQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const processor = new AnalysisProcessor(
      repository as never,
      {} as never,
      {} as never,
      deadLetterQueue as never,
    );
    return { processor, repository, deadLetterQueue };
  };

  const job = (attemptsMade: number, attempts: number) => ({
    data: { analysisId },
    attemptsMade,
    opts: { attempts },
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not dead-letter a job that still has attempts left', async () => {
    const { processor, deadLetterQueue } = buildProcessor();

    await processor.handleFailed(
      job(1, 3) as never,
      new Error('transient failure'),
    );

    expect(deadLetterQueue.add).not.toHaveBeenCalled();
  });

  it('dead-letters a job after its last attempt and marks the analysis failed', async () => {
    const { processor, repository, deadLetterQueue } = buildProcessor();

    await processor.handleFailed(
      job(3, 3) as never,
      new Error('boom'),
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', attempts: 3 }),
    );
    expect(deadLetterQueue.add).toHaveBeenCalledWith(
      'analysis-failed',
      expect.objectContaining({ analysisId, attempts: 3 }),
      expect.any(Object),
    );
  });
});
