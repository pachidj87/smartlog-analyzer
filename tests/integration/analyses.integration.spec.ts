import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { GlobalHttpExceptionFilter } from '../../src/api/src/common/filters/global-http-exception.filter';
import { AnalysesController } from '../../src/api/src/modules/analyses/analyses.controller';
import { AnalysesService } from '../../src/api/src/modules/analyses/analyses.service';

describe('Analysis HTTP endpoints', () => {
  let app: INestApplication;
  const analysis = {
    id: '507f1f77bcf86cd799439011',
    status: 'queued',
    createdAt: '2026-11-02T14:00:00.000Z',
  };
  const analysesService = {
    enqueue: jest.fn().mockResolvedValue(analysis),
    findAll: jest.fn().mockResolvedValue({
      items: [analysis],
      total: 1,
      limit: 20,
      offset: 0,
    }),
    findOne: jest.fn().mockResolvedValue(analysis),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AnalysesController],
      providers: [{ provide: AnalysesService, useValue: analysesService }],
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

  it('queues an analysis and returns HTTP 202 with its status', async () => {
    await request(app.getHttpServer())
      .post('/api/logs/analyze')
      .send({ logIds: ['507f1f77bcf86cd799439012'] })
      .expect(202)
      .expect(({ body }) => {
        expect(body).toEqual(analysis);
      });
  });

  it('rejects malformed log IDs before queueing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/logs/analyze')
      .send({ logIds: ['not-an-object-id'] })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/api/logs/analyze',
    });
    expect(analysesService.enqueue).not.toHaveBeenCalled();
  });

  it('returns paginated analyses', async () => {
    await request(app.getHttpServer())
      .get('/api/analysis')
      .query({ status: 'queued', limit: '1', offset: '0' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          items: [analysis],
          total: 1,
          limit: 1,
          offset: 0,
        });
      });
  });

  it('validates analysis IDs and returns a consistent 404 for missing records', async () => {
    const invalid = await request(app.getHttpServer())
      .get('/api/analysis/not-an-id')
      .expect(400);
    expect(invalid.body).toMatchObject({
      statusCode: 400,
      path: '/api/analysis/not-an-id',
    });

    analysesService.findOne.mockRejectedValueOnce(
      new NotFoundException('analysis not found'),
    );
    const missing = await request(app.getHttpServer())
      .get('/api/analysis/507f1f77bcf86cd799439013')
      .expect(404);
    expect(missing.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      path: '/api/analysis/507f1f77bcf86cd799439013',
    });
  });
});
