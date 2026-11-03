import { AnalysesService } from '../../src/api/src/modules/analyses/analyses.service';

describe('AnalysesService.findDeadLetters', () => {
  const buildService = (deadLetterQueue: unknown) =>
    new AnalysesService(
      {} as never,
      {} as never,
      {} as never,
      deadLetterQueue as never,
    );

  it('maps waiting dead-letter jobs with pagination', async () => {
    const deadLetterQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(1),
      getJobs: jest.fn().mockResolvedValue([
        {
          id: 'j1',
          data: { analysisId: 'a1', attempts: 3, failedReason: 'boom' },
          timestamp: 1,
        },
      ]),
    };
    const service = buildService(deadLetterQueue);

    await expect(
      service.findDeadLetters({ limit: 10, offset: 0 }),
    ).resolves.toEqual({
      items: [
        {
          id: 'j1',
          analysisId: 'a1',
          failedReason: 'boom',
          attempts: 3,
          createdAt: new Date(1).toISOString(),
        },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    });
    expect(deadLetterQueue.getJobs).toHaveBeenCalledWith(['waiting'], 0, 9);
  });

  it('returns an empty page when the dead-letter queue is idle', async () => {
    const deadLetterQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getJobs: jest.fn().mockResolvedValue([]),
    };
    const service = buildService(deadLetterQueue);

    await expect(
      service.findDeadLetters({ limit: 20, offset: 0 }),
    ).resolves.toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });
});
