import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { LogsController } from '../../src/api/src/modules/logs/logs.controller';
import { LogsService } from '../../src/api/src/modules/logs/logs.service';
import { GlobalHttpExceptionFilter } from '../../src/api/src/common/filters/global-http-exception.filter';

describe('POST /api/logs', () => {
  let app: INestApplication;
  const createdLog = {
    id: 'log-1',
    service: 'payment-api',
    timestamp: '2026-11-02T14:00:00.000Z',
    level: 'error',
    message: 'Payment authorization timed out',
  };
  const logsService = {
    create: jest.fn().mockResolvedValue(createdLog),
    findAll: jest.fn().mockResolvedValue({
      items: [createdLog],
      total: 1,
      limit: 1,
      offset: 2,
    }),
    getStats: jest.fn().mockImplementation((query) => {
      if (
        query.from &&
        query.to &&
        new Date(query.from) > new Date(query.to)
      ) {
        throw new BadRequestException(
          'from must be earlier than or equal to to',
        );
      }
      return {
        groupBy: query.groupBy,
        from: query.from ?? null,
        to: query.to ?? null,
        total: 3,
        buckets: [{ key: 'payment-api', count: 3 }],
      };
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LogsController],
      providers: [{ provide: LogsService, useValue: logsService }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ingests a valid log and returns the created record', async () => {
    await request(app.getHttpServer())
      .post('/api/logs')
      .send({
        service: createdLog.service,
        timestamp: createdLog.timestamp,
        level: createdLog.level,
        message: createdLog.message,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject(createdLog);
      });
  });

  it('rejects a service that is not a lowercase slug with a consistent error body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/logs')
      .send({
        service: 'Payment API',
        timestamp: createdLog.timestamp,
        level: createdLog.level,
        message: createdLog.message,
      })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: expect.stringContaining('lowercase slug'),
        path: '/api/logs',
        timestamp: expect.any(String),
      }),
    );
    expect(logsService.create).not.toHaveBeenCalled();
  });

  it('rejects properties outside the log contract', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/logs')
      .send({
        service: createdLog.service,
        timestamp: createdLog.timestamp,
        level: createdLog.level,
        message: createdLog.message,
        unexpected: true,
      })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/api/logs',
    });
    expect(response.body.message).toContain('property unexpected should not exist');
    expect(logsService.create).not.toHaveBeenCalled();
  });

  it('lists logs with typed filters and pagination', async () => {
    await request(app.getHttpServer())
      .get('/api/logs')
      .query({
        service: 'payment-api',
        level: 'error',
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-03T00:00:00.000Z',
        limit: '1',
        offset: '2',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          items: [createdLog],
          total: 1,
          limit: 1,
          offset: 2,
        });
      });

    expect(logsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'payment-api',
        level: 'error',
        limit: 1,
        offset: 2,
      }),
    );
  });

  it('aggregates logs by service within an inclusive date range', async () => {
    await request(app.getHttpServer())
      .get('/api/logs/stats')
      .query({
        groupBy: 'service',
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-03T00:00:00.000Z',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          groupBy: 'service',
          from: '2026-11-01T00:00:00.000Z',
          to: '2026-11-03T00:00:00.000Z',
          total: 3,
          buckets: [{ key: 'payment-api', count: 3 }],
        });
      });

    expect(logsService.getStats).toHaveBeenCalledWith(
      expect.objectContaining({ groupBy: 'service' }),
    );
  });

  it.each([
    ['an unsupported groupBy', { groupBy: 'message' }, '/api/logs/stats?groupBy=message'],
    ['a non-date from', { from: 'not-a-date' }, '/api/logs/stats?from=not-a-date'],
    [
      'a reversed range',
      {
        from: '2026-11-03T00:00:00.000Z',
        to: '2026-11-01T00:00:00.000Z',
      },
      '/api/logs/stats?from=2026-11-03T00%3A00%3A00.000Z&to=2026-11-01T00%3A00%3A00.000Z',
    ],
  ])('rejects %s on the stats endpoint', async (_label, query, path) => {
    const response = await request(app.getHttpServer())
      .get('/api/logs/stats')
      .query(query)
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: expect.anything(),
        path,
        timestamp: expect.any(String),
      }),
    );
  });

  it.each([
    ['a limit above the cap', { limit: 101 }, '/api/logs?limit=101'],
    ['a zero limit', { limit: 0 }, '/api/logs?limit=0'],
    ['a negative offset', { offset: -1 }, '/api/logs?offset=-1'],
  ])('rejects %s with the shared error body', async (_label, query, path) => {
    const response = await request(app.getHttpServer())
      .get('/api/logs')
      .query(query)
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: expect.anything(),
        path,
        timestamp: expect.any(String),
      }),
    );
    expect(logsService.findAll).not.toHaveBeenCalled();
  });
});
