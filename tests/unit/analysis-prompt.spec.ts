import { ObjectId } from 'mongodb';

import { AnalysesService } from '../../src/api/src/modules/analyses/analyses.service';
import { AnalysisProcessor } from '../../src/api/src/modules/analyses/processors/analysis.processor';

describe('user analysis prompt', () => {
  const analysisId = '507f1f77bcf86cd799439011';
  const logId = '507f1f77bcf86cd799439012';
  const prompt = 'Find repeated timeout errors';

  it('trims and persists the prompt when queueing an analysis', async () => {
    const now = new Date('2026-11-03T10:00:00.000Z');
    const repository = {
      create: jest.fn((value) => ({
        ...value,
        _id: { toHexString: () => analysisId },
      })),
      save: jest.fn(async (value) => value),
    };
    const logsService = { findByIds: jest.fn().mockResolvedValue([{}]) };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new AnalysesService(
      repository as never,
      logsService as never,
      queue as never,
      {} as never,
    );

    await expect(
      service.enqueue({ logIds: [logId], prompt: ` ${prompt} ` }),
    ).resolves.toMatchObject({
      id: analysisId,
      prompt,
      status: 'queued',
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ prompt, logIds: [logId] }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'analyze-logs',
      { analysisId },
      { jobId: analysisId },
    );
  });

  it('passes the stored prompt from the worker to the provider', async () => {
    const analysis = {
      _id: new ObjectId(analysisId),
      logIds: [logId],
      prompt,
      status: 'queued',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const logs = [{ message: 'timeout', timestamp: new Date() }];
    const repository = {
      findOneBy: jest.fn().mockResolvedValue(analysis),
      save: jest.fn().mockResolvedValue(analysis),
    };
    const logsService = { findByIds: jest.fn().mockResolvedValue(logs) };
    const providers = {
      analyze: jest.fn().mockResolvedValue({
        provider: 'OpenAI',
        result: { summary: 'Timeout pattern', insights: [] },
      }),
    };
    const processor = new AnalysisProcessor(
      repository as never,
      logsService as never,
      providers as never,
      {} as never,
    );

    await processor.process({
      data: { analysisId },
      attemptsMade: 0,
    } as never);

    expect(providers.analyze).toHaveBeenCalledWith(logs, prompt);
  });
});
