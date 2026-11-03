import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HttpHealthIndicator,
  MemoryHealthIndicator,
  TerminusModule,
} from '@nestjs/terminus';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource } from 'typeorm';

import { GlobalHttpExceptionFilter } from '../../src/api/src/common/filters/global-http-exception.filter';
import { HealthController } from '../../src/api/src/modules/health/health.controller';
import { AnalysisProviderRegistry } from '../../src/api/src/modules/analyses/providers/analysis-provider.registry';

describe('GET /api/health', () => {
  let app: INestApplication;
  let cacheStore: Map<string, unknown>;
  let cacheManager: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let dataSource: any;
  let providers: { checkActiveProvider: jest.Mock };

  beforeAll(async () => {
    cacheStore = new Map<string, unknown>();
    cacheManager = {
      set: jest.fn((key: string, value: unknown) =>
        cacheStore.set(key, value),
      ),
      get: jest.fn((key: string) => cacheStore.get(key)),
      del: jest.fn((key: string) => cacheStore.delete(key)),
    };
    dataSource = {
      isInitialized: true,
      mongoManager: {
        mongoQueryRunner: {
          databaseConnection: {
            db: jest.fn().mockReturnValue({
              command: jest.fn().mockResolvedValue({ ok: 1 }),
            }),
          },
        },
      },
    };
    providers = {
      checkActiveProvider: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        {
          provide: HttpHealthIndicator,
          useValue: {
            responseCheck: jest
              .fn()
              .mockResolvedValue({ root_endpoint: { status: 'up' } }),
          },
        },
        {
          provide: MemoryHealthIndicator,
          useValue: {
            checkHeap: jest
              .fn()
              .mockResolvedValue({ memory_heap: { status: 'up' } }),
            checkRSS: jest
              .fn()
              .mockResolvedValue({ memory_rss: { status: 'up' } }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                APP_BASE_URL: 'http://localhost:3306',
                HEALTH_CHECK_MEMORY_HEAP_LIMIT: 250,
                HEALTH_CHECK_MEMORY_RSS_LIMIT: 350,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        { provide: AnalysisProviderRegistry, useValue: providers },
        { provide: CACHE_MANAGER, useValue: cacheManager },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    dataSource.isInitialized = true;
    cacheManager.get.mockImplementation((key: string) =>
      cacheStore.get(key),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns HTTP 200 with every dependency up when all checks succeed', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      info: {
        root_endpoint: { status: 'up' },
        database: { status: 'up' },
        cache: { status: 'up' },
        aiProvider: { status: 'up' },
        memory_heap: { status: 'up' },
        memory_rss: { status: 'up' },
      },
      error: {},
      details: {
        root_endpoint: { status: 'up' },
        database: { status: 'up' },
        cache: { status: 'up' },
        aiProvider: { status: 'up' },
        memory_heap: { status: 'up' },
        memory_rss: { status: 'up' },
      },
    });
  });

  it('returns HTTP 503 naming MongoDB and its error when the database is down', async () => {
    dataSource.isInitialized = false;

    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(503);

    expect(response.body).toMatchObject({
      statusCode: 503,
      status: 'error',
      error: {
        database: {
          status: 'down',
          message: 'MongoDB datasource is not initialized',
        },
      },
      details: {
        database: {
          status: 'down',
          message: 'MongoDB datasource is not initialized',
        },
      },
      path: '/api/health',
      timestamp: expect.any(String),
    });
    expect(response.body.details.cache).toEqual({ status: 'up' });
    expect(response.body).not.toHaveProperty('stack');
    expect(response.text).not.toMatch(/\n\s+at /);
  });

  it('returns HTTP 503 naming Redis and its error when the cache is down', async () => {
    cacheManager.get.mockResolvedValueOnce('unexpected-value');

    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(503);

    expect(response.body).toMatchObject({
      statusCode: 503,
      status: 'error',
      error: {
        cache: {
          status: 'down',
          message: 'Cache returned an unexpected value',
        },
      },
      path: '/api/health',
      timestamp: expect.any(String),
    });
    expect(response.body).not.toHaveProperty('stack');
    expect(response.text).not.toMatch(/\n\s+at /);
  });
});
