import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";

import { LogEntryInterface } from "src/common/contracts";
import { AnalysisProviderInterface, AnalysisResultInterface } from "../contracts";
import { ProviderName } from "../enums";
import { isAnalysisResult } from "../validators";


export abstract class BaseAnalysisProvider implements AnalysisProviderInterface {
  abstract readonly name: ProviderName;

  constructor(
    protected readonly http: HttpService,
    protected readonly config: ConfigService,
  ) {}

  abstract analyze(logs: LogEntryInterface[]): Promise<AnalysisResultInterface>;

  abstract checkHealth(): Promise<void>;

  protected parseAnalysisResult(content: string): AnalysisResultInterface {
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new ServiceUnavailableException(
        `${this.name} returned invalid JSON`,
      );
    }

    if (!isAnalysisResult(value)) {
      throw new ServiceUnavailableException(
        `${this.name} returned an invalid analysis response`,
      );
    }

    return value;
  }

  protected createAnalysisPrompt(logs: LogEntryInterface[]): string {
    const logMapping = logs.map((log) => ({
      service: log.service,
      timestamp: log.timestamp.toISOString(),
      level: log.level,
      message: log.message,
      metadata: log.metadata,
    }));

    const analysisPrompt = [
      'Analyze these service logs and return only a JSON object with this shape:',
      '{"summary":"string","insights":[{"title":"string","description":"string","severity":"string"}]}',
      'Logs:',
      JSON.stringify(logMapping),
    ].join('\n');

    return analysisPrompt;
  }

  protected getTextContent(
    value: unknown,
    providerName: string,
    path: string[],
  ): string {
    let current: unknown = value;
    for (const key of path) {
      if (typeof current !== 'object' || current === null || Array.isArray(current)) {
        throw new ServiceUnavailableException(
          `${providerName} returned an invalid analysis response`,
        );
      }
      current = (current as Record<string, unknown>)[key];
    }
    if (typeof current !== 'string') {
      throw new ServiceUnavailableException(
        `${providerName} returned an invalid analysis response`,
      );
    }
    return current;
  }

  protected requiredConfig(suffix: 'URL' | 'HEALTH_URL' | 'API_KEY'): string {
    const value = this.config.get<string>(`AI_PROVIDER_${this.name.toUpperCase()}_${suffix}`);
    if (!value) {
      throw new ServiceUnavailableException(
        `Missing AI_PROVIDER_${this.name.toUpperCase()}_${suffix} configuration`,
      );
    }
    return value;
  }
}