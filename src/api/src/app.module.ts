import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisInsStore } from 'cache-manager-ioredis-yet';
import Redis from 'ioredis';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppDataSource } from './db/data-source';
import { AnalysesModule } from './modules/analyses/analyses.module';
import { HealthModule } from './modules/health/health.module';
import { LogsModule } from './modules/logs/logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, expandVariables: true }),
    TypeOrmModule.forRoot(AppDataSource),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = Number(config.get('CACHE_TTL_SECONDS', 30)) * 1000;
        const redis = new Redis(
          config.get<string>('REDIS_URL', 'redis://redis:6379'),
          { maxRetriesPerRequest: null },
        );

        return {
          store: redisInsStore(redis, { ttl }),
          ttl,
        };
      },
    }),
    LogsModule,
    AnalysesModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
