import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  HttpHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Cache } from 'cache-manager';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

import { AnalysisProviderRegistry } from '../analyses/providers/analysis-provider.registry';
import { markClientSafeResponse } from '../../common/errors';
import { isRecord } from '../../common/validators';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly http: HttpHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly config: ConfigService,
    private readonly providers: AnalysisProviderRegistry,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check service health' })
  @ApiResponse({ status: 200, description: 'All configured dependencies are healthy' })
  @ApiResponse({ status: 503, description: 'One or more dependencies are unhealthy' })
  async check() {
    const logger = new Logger(HealthController.name);
    const baseUrl = this.config.get<string>(
      'APP_BASE_URL',
      'http://api:3000/',
    );
    // The API is mounted under the global prefix, so the root route lives at
    // /api, not at the bare base URL.
    const apiRootUrl = new URL('api', baseUrl).toString();
    try {
      return await this.health.check([
        async () =>
          this.http.responseCheck(
            'root_endpoint',
            apiRootUrl,
            (response) => response.status === 200,
          ),
        async () => {
          try {
            if (!this.dataSource.isInitialized) {
              throw new Error('MongoDB datasource is not initialized');
            }
            await this.dataSource.mongoManager.mongoQueryRunner.databaseConnection
              .db(this.config.get<string>('MONGODB_DATABASE', 'smartlog'))
              .command({ ping: 1 });
            return this.indicator.check('database').up();
          } catch (error) {
            logger.error(
              'MongoDB health check failed',
              error instanceof Error ? error.stack : String(error),
            );
            return this.indicator
              .check('database')
              .down(error instanceof Error ? error.message : String(error));
          }
        },
        async () => {
          const key = `health-check:${randomUUID()}`;
          const value = randomUUID();
          try {
            await this.cache.set(key, value, 1000);
            if ((await this.cache.get(key)) !== value) {
              throw new Error('Cache returned an unexpected value');
            }
            await this.cache.del(key);
            return this.indicator.check('cache').up();
          } catch (error) {
            logger.error(
              'Cache health check failed',
              error instanceof Error ? error.stack : String(error),
            );
            return this.indicator
              .check('cache')
              .down(error instanceof Error ? error.message : String(error));
          }
        },
        async () => {
          try {
            await this.providers.checkActiveProvider();
            return this.indicator.check('aiProvider').up();
          } catch (error) {
            logger.error(
              'Active AI provider health check failed',
              error instanceof Error ? error.stack : String(error),
            );
            return this.indicator
              .check('aiProvider')
              .down(error instanceof Error ? error.message : String(error));
          }
        },
        async () =>
          this.memory.checkHeap(
            'memory_heap',
            +this.config.get('HEALTH_CHECK_MEMORY_HEAP_LIMIT', '250') *
              1024 *
              1024,
          ),
        async () =>
          this.memory.checkRSS(
            'memory_rss',
            +this.config.get('HEALTH_CHECK_MEMORY_RSS_LIMIT', '350') *
              1024 *
              1024,
          ),
      ]);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        const payload = error.getResponse();
        if (isRecord(payload)) {
          // Terminus already built a body that names every unhealthy
          // dependency and why. Mark it so the global filter forwards it
          // instead of flattening it to "Internal server error".
          throw new ServiceUnavailableException(
            markClientSafeResponse({ ...payload }),
          );
        }
      }
      throw error;
    }
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Process is running' })
  liveness() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
