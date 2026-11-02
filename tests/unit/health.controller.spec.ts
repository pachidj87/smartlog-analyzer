import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckService,
  HealthIndicatorService,
  HttpHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { HealthController } from '../../src/api/src/modules/health/health.controller';
import { AnalysisProviderRegistry } from '../../src/api/src/modules/analyses/analysis-provider.registry';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: any;
  let configService: any;
  let module: TestingModule;

  beforeEach(async () => {
    const cacheStore = new Map<string, unknown>();
    healthService = {
      check: jest.fn().mockResolvedValue({ status: 'ok' }),
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
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthService },
        {
          provide: HealthIndicatorService,
          useValue: {
            check: jest.fn().mockReturnValue({
              up: jest.fn().mockReturnValue({ cache: { status: 'up' } }),
              down: jest.fn().mockReturnValue({ cache: { status: 'down' } }),
            }),
          },
        },
        {
          provide: HttpHealthIndicator,
          useValue: { responseCheck: jest.fn() },
        },
        {
          provide: MemoryHealthIndicator,
          useValue: { checkHeap: jest.fn(), checkRSS: jest.fn() },
        },
        { provide: ConfigService, useValue: configService },
        { provide: AnalysisProviderRegistry, useValue: { checkActiveProvider: jest.fn() } },
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
        {
          provide: DataSource,
          useValue: {
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
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call healthService.check on check()', async () => {
    const result = await controller.check();
    expect(healthService.check).toHaveBeenCalled();
    expect(result).toHaveProperty('status', 'ok');
  });

  it('should configure checks with all health indicators', async () => {
    await controller.check();
    const checkCall = healthService.check.mock.calls[0][0];
    expect(checkCall).toHaveLength(6);
  });

  it('should verify cache access through the Nest cache manager', async () => {
    await controller.check();
    const cacheCheck = healthService.check.mock.calls[0][0][2];
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
});
