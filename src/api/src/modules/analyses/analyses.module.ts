import { Logger, Module } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AnalysisEntity } from './entities/analysis.entity';
import { AnalysisProcessor } from './processors/analysis.processor';
import { AnalysesController } from './analyses.controller';
import { LogAnalysisController } from './log-analysis.controller';
import { AnalysesService } from './analyses.service';
import { ANALYSIS_QUEUE_NAME } from './constants/analysis-queue-name.const';
import { ANALYSIS_DEAD_LETTER_QUEUE_NAME } from './constants/analysis-dead-letter-queue-name.const';
import { ProviderName } from './enums';
import { AnalysisProviderRegistry, AnthropicAnalysisProvider, GeminiAnalysisProvider, OpenAiAnalysisProvider } from './providers';
import { LogsModule } from '../logs/logs.module';
import { LogsService } from '../logs/logs.service';
import { ANALYSIS_PROVIDERS, LOGS_SERVICE } from './symbols';


@Module({
  imports: [
    ConfigModule,
    HttpModule,
    TypeOrmModule.forFeature([AnalysisEntity]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(
          config.get<string>('REDIS_URL', 'redis://redis:6379'),
        );
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            ...(redisUrl.username
              ? { username: decodeURIComponent(redisUrl.username) }
              : {}),
            ...(redisUrl.password
              ? { password: decodeURIComponent(redisUrl.password) }
              : {}),
          },
        };
      },
    }),
    BullModule.registerQueue(
      {
        name: ANALYSIS_QUEUE_NAME,
        defaultJobOptions: {
          attempts: Number(process.env.AI_RETRY_ATTEMPTS ?? 3),
          backoff: {
            type: 'exponential',
            delay: Number(process.env.AI_RETRY_BACKOFF_MS ?? 1000),
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      },
      {
        name: ANALYSIS_DEAD_LETTER_QUEUE_NAME,
        defaultJobOptions: { removeOnComplete: false },
      },
    ),
    LogsModule,
  ],
  controllers: [AnalysesController, LogAnalysisController],
  providers: [
    AnalysesService,
    AnalysisProcessor,
    AnalysisProviderRegistry,
    {
      provide: ANALYSIS_PROVIDERS,
      inject: [HttpService, ConfigService],
      useFactory: (http: HttpService, config: ConfigService) => {
        const names = [
          config.get<string>('AI_PROVIDER'),
          config.get<string>('AI_FALLBACK_PROVIDER'),
        ].filter((name): name is string => Boolean(name));
        const providers = names.map((name) => {
          switch (name.trim().toLowerCase()) {
            case ProviderName.ANTHROPIC.toLowerCase():
              return new AnthropicAnalysisProvider(http, config);
            case ProviderName.GEMINI.toLowerCase():
              return new GeminiAnalysisProvider(http, config);
            case ProviderName.OPENAI.toLowerCase():
              return new OpenAiAnalysisProvider(http, config);
            default: {
              const logger = new Logger(AnalysesModule.name);
              logger.warn(`Unknown AI provider "${name}"`);
              return null;
            }
          }
        }).filter((provider): provider is NonNullable<typeof provider> => provider !== null);
        return providers;
      },
    },
    {
      provide: LOGS_SERVICE,
      useClass: LogsService,
    }
  ],
  exports: [AnalysisProviderRegistry],
})
export class AnalysesModule {}
