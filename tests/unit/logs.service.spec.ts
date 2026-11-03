import { BadRequestException } from '@nestjs/common';

import { LogsService } from '../../src/api/src/modules/logs/logs.service';

describe('LogsService.getStats', () => {
  const buildService = (aggregateResult: unknown[]) => {
    const repository = {
      aggregate: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue(aggregateResult),
      }),
      countDocuments: jest
        .fn()
        .mockResolvedValue(
          (aggregateResult as Array<{ count: number }>).reduce(
            (total, bucket) => total + bucket.count,
            0,
          ),
        ),
    };
    const service = new LogsService(repository as never);
    return { service, repository };
  };

  it('groups logs by service and maps the buckets', async () => {
    const { service, repository } = buildService([
      { _id: 'payment-api', count: 3 },
    ]);

    await expect(
      service.getStats({
        groupBy: 'service',
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-03T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      groupBy: 'service',
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-03T00:00:00.000Z',
      total: 3,
      buckets: [{ key: 'payment-api', count: 3 }],
    });

    expect(repository.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: {
            timestamp: {
              $gte: new Date('2026-11-01T00:00:00.000Z'),
              $lte: new Date('2026-11-03T00:00:00.000Z'),
            },
          },
        }),
        expect.objectContaining({ $group: { _id: '$service', count: { $sum: 1 } } }),
        expect.objectContaining({ $sort: { count: -1, _id: 1 } }),
        expect.objectContaining({ $limit: 100 }),
      ]),
    );
  });

  it('returns an empty bucket list when there are no logs', async () => {
    const { service } = buildService([]);

    await expect(service.getStats({ groupBy: 'level' })).resolves.toEqual({
      groupBy: 'level',
      from: null,
      to: null,
      total: 0,
      buckets: [],
    });
  });

  it('rejects a reversed date range', async () => {
    const { service } = buildService([]);

    await expect(
      service.getStats({
        groupBy: 'service',
        from: '2026-11-03T00:00:00.000Z',
        to: '2026-11-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
