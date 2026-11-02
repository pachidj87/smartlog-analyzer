import {
  Injectable,
} from '@nestjs/common';

import { AnalysisResult } from '../contracts';
import { ProviderName } from '../enums';
import { BaseAnalysisProvider } from './base-analysis.provider';
import { LogEntry } from 'src/common/contracts';

@Injectable()
export class AnthropicAnalysisProvider extends BaseAnalysisProvider {
  readonly name = ProviderName.ANTHROPIC;

  async analyze(logs: LogEntry[]): Promise<AnalysisResult> {
    const content = this.createAnalysisPrompt(logs);
    const response = await this.http.axiosRef.post<unknown>(
      this.requiredConfig('URL'),
      {
        model: this.config.get<string>(
          'AI_PROVIDER_ANTHROPIC_MODEL',
          'claude-3-5-haiku-latest',
        ),
        max_tokens: 2048,
        system: 'Return only valid JSON matching the requested schema.',
        messages: [{ role: 'user', content }],
      },
      {
        timeout: Number(this.config.get('AI_REQUEST_TIMEOUT_MS', 15000)),
        headers: {
          'x-api-key': this.requiredConfig('API_KEY'),
          'anthropic-version': '2023-06-01',
        },
      },
    );

    const textContext = this.getTextContent(response.data, this.name, [
      'completion',
      'content',
      '0',
      'text',
    ]);

    const parsedResult = this.parseAnalysisResult(
      textContext
    );

    return parsedResult;
  }

  async checkHealth(): Promise<void> {
    await this.http.axiosRef.get(this.requiredConfig('HEALTH_URL'), {
      timeout: Number(this.config.get('AI_HEALTH_TIMEOUT_MS', 3000)),
      headers: {
        'x-api-key': this.requiredConfig('API_KEY'),
        'anthropic-version': '2023-06-01',
      },
    });
  }
}
