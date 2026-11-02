import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AnalysisProvider } from '../contracts';
import { LogEntry } from 'src/common/contracts';
import { ANALYSIS_PROVIDERS } from 'src/modules/analyses/analisys-provider.symbol';


@Injectable()
export class AnalysisProviderRegistry {
  private readonly logger = new Logger(AnalysisProviderRegistry.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(ANALYSIS_PROVIDERS)
    private readonly providers: AnalysisProvider[],
  ) {}

  async analyze(logs: LogEntry[]) {
    const activeName = this.config.get<string>('AI_PROVIDER');
    const fallbackName = this.config.get<string>('AI_FALLBACK_PROVIDER');
    const candidates = [activeName, fallbackName].filter(
      (name, index, list): name is string =>
        Boolean(name) && list.indexOf(name) === index,
    );
    const failures: string[] = [];

    for (const name of candidates) {
      const provider = this.providers.find((candidate) => candidate.name === name);
      if (!provider) {
        this.logger.warn(`AI provider adapter is not registered: ${name}`);
        failures.push(name);
        continue;
      }

      try {
        const result = await provider.analyze(logs);
        return { result, provider: name };
      } catch (error) {
        failures.push(name);
        if (name === activeName && fallbackName && fallbackName !== activeName) {
          this.logger.warn(
            `Active AI provider failed; trying configured fallback: ${name}: ${this.errorMessage(error)}`,
          );
        } else {
          this.logger.error(
            `AI provider failed: ${name}: ${this.errorMessage(error)}`,
          );
        }
      }
    }

    if (candidates.length === 0) {
      this.logger.error('AI analysis failed: no active or fallback provider is configured');
    } else {
      this.logger.error(`All configured AI providers failed: ${failures.join(', ')}`);
    }
    throw new ServiceUnavailableException(
      'All configured AI providers failed',
    );
  }

  async checkActiveProvider(): Promise<void> {
    const activeName = this.config.get<string>('AI_PROVIDER');
    const provider = this.providers.find(
      (candidate) => candidate.name === activeName,
    );

    if (!activeName || !provider) {
      throw new ServiceUnavailableException(
        'The active AI provider is not configured',
      );
    }

    await provider.checkHealth();
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
