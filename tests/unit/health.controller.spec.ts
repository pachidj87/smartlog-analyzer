import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckService,
  HttpHealthIndicator,
  MemoryHealthIndicator,
  TerminusModule,
} from '@nestjs/terminus';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { HealthController } from '../../src/api/src/modules/health/health.controller';
import { AnalysisProviderRegistry } from '../../src/api/src/modules/analyses/providers/analysis-provider.registry';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthCheckService;
  let configService: any;
  let http: { responseCheck: jest.Mock };
  let memory: { checkHeap: jest.Mock; checkRSS: jest.Mock };
  let providers: { checkActiveProvider: jest.Mock };
  let dataSource: any;
  let cacheStore: Map<string, unknown>;
  let module: TestingModule;

  beforeEach(async () => {
    cacheStore = new Map<string, unknown>();
    http = {
      responseCheck: jest.fn().mockResolvedValue({
        root_endpoint: { status: 'up' },
      }),
    };
    memory = {
      checkHeap: jest.fn().mockResolvedValue({
        memory_heap: { status: 'up' },
      }),
      checkRSS: jest.fn().mockResolvedValue({
        memory_rss: { status: 'up' },
      }),
    };
    providers = {
      checkActiveProvider: jest.fn().mockResolvedValue(undefined),
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

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          APP_BASE_URL: 'http://localhost:3306',
          HEALTH_CHECK_MEMORY_HEAP_LIMIT: 250,
          HEALTH_CHECK_MEMORY_RSS_LIMIT: 350,
        };
        return config[key] ?? defaultValue;
      }),
    };

    module = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: HttpHealthIndicator, useValue: http },
        { provide: MemoryHealthIndicator, useValue: memory },
        { provide: ConfigService, useValue: configService },
        { provide: AnalysisProviderRegistry, useValue: providers },
        {
          provide: CACHE_MANAGER,
          useValue: {
            set: jest.fn((key: string, value: unknown) =>
              cacheStore.set(key, value),
            ),
            get: jest.fn((key: string) => cacheStore.get(key)),
            del: jest.fn((key: string) => cacheStore.delete(key)),
          },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthCheckService>(HealthCheckService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should configure checks with all health indicators', async () => {
    const spy = jest.spyOn(healthService, 'check');

    await controller.check();

    const indicators = spy.mock.calls[0][0] as unknown[];
    expect(indicators).toHaveLength(6);
  });

  it('should report every dependency as up when all checks succeed', async () => {
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.details).toEqual({
      root_endpoint: { status: 'up' },
      database: { status: 'up' },
      cache: { status: 'up' },
      aiProvider: { status: 'up' },
      memory_heap: { status: 'up' },
      memory_rss: { status: 'up' },
    });
  });

  it('should verify cache access through the Nest cache manager', async () => {
    const spy = jest.spyOn(healthService, 'check');
    await controller.check();
    const cacheCheck = (spy.mock.calls[0][0] as Array<() => unknown>)[2];
    const cacheManager = module.get(CACHE_MANAGER);

    await cacheCheck();

    expect(cacheManager.set).toHaveBeenCalledWith(
      expect.stringMatching(/^health-check:/),
      expect.any(String),
      1000,
    );
    expect(cacheManager.get).toHaveBeenCalled();
    expect(cacheManager.del).toHaveBeenCalled();
  });

  it('should return HTTP 503 with the unhealthy dependency when MongoDB is down', async () => {
    dataSource.isInitialized = false;

    const error = await controller.check().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({
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
    });
  });

  it('should return HTTP 503 with the unhealthy dependency when Redis is down', async () => {
    const cacheManager = module.get(CACHE_MANAGER);
    cacheManager.get.mockResolvedValueOnce('unexpected-value');

    const error = await controller.check().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({
      status: 'error',
      error: {
        cache: {
          status: 'down',
          message: 'Cache returned an unexpected value',
        },
      },
    });
  });

  it('should return HTTP 503 when the active AI provider is down', async () => {
    providers.checkActiveProvider.mockRejectedValueOnce(
      new Error('provider unavailable'),
    );

    const error = await controller.check().catch((caught) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({
      status: 'error',
      error: {
        aiProvider: {
          status: 'down',
          message: 'provider unavailable',
        },
      },
    });
  });
});
