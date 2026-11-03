import { Injectable } from '@nestjs/common';

import { AnalysisResultInterface } from '../contracts';
import { ProviderName } from '../enums';
import { BaseAnalysisProvider } from './base-analysis.provider';
import { LogEntryInterface } from 'src/common/contracts';


@Injectable()
export class GeminiAnalysisProvider extends BaseAnalysisProvider {
  readonly name = ProviderName.GEMINI;

  async analyze(
    logs: LogEntryInterface[],
    prompt?: string,
  ): Promise<AnalysisResultInterface> {
    const text = this.createAnalysisPrompt(logs, prompt);
    const url = this.requiredConfig('URL');
    const response = await this.http.axiosRef.post<unknown>(
      url,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      },
      {
        timeout: Number(this.config.get('AI_REQUEST_TIMEOUT_MS', 15000)),
        headers: { 'x-goog-api-key': this.requiredConfig('API_KEY') },
      },
    );

    const textContext = this.getTextContent(response.data, this.name, [
      'candidates',
      '0',
      'content',
      'parts',
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
      headers: { 'x-goog-api-key': this.requiredConfig('API_KEY') },
    });
  }
}
