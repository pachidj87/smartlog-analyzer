import { Injectable } from '@nestjs/common';

import { AnalysisResult } from '../contracts';
import { ProviderName } from '../enums';
import { LogEntry } from 'src/common/contracts';
import { BaseAnalysisProvider } from './base-analysis.provider';


@Injectable()
export class OpenAiAnalysisProvider extends BaseAnalysisProvider {
  readonly name = ProviderName.OPENAI;

  async analyze(logs: LogEntry[]): Promise<AnalysisResult> {
    const content = this.createAnalysisPrompt(logs);
    const response = await this.http.axiosRef.post<unknown>(
      this.requiredConfig('URL'),
      {
        model: this.config.get<string>(
          'AI_PROVIDER_OPENAI_MODEL',
          'gpt-4o-mini',
        ),
        messages: [
          {
            role: 'system',
            content: 'Return only valid JSON matching the requested schema.',
          },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
      },
      {
        timeout: Number(this.config.get('AI_REQUEST_TIMEOUT_MS', 15000)),
        headers: {
          Authorization: `Bearer ${this.requiredConfig('API_KEY')}`,
        },
      },
    );

    const textContext = this.getTextContent(response.data, this.name, [
      'choices',
      '0',
      'message',
      'content',
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
        Authorization: `Bearer ${this.requiredConfig('API_KEY')}`,
      },
    });
  }
}
