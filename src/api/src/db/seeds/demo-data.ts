import { CreateLogDto } from '../../modules/logs/dto/create-log.dto';
import { AnalysisResultInterface } from '../../modules/analyses/contracts/analysis-result.interface';
import { AnalysisStatus } from '../../modules/analyses/enums/analysis-status.enum';

export interface DemoAnalysis {
  logIds: string[];
  status: AnalysisStatus;
  provider?: string;
  result?: AnalysisResultInterface;
  error?: string;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const SERVICES = [
  'payment-api',
  'auth-service',
  'catalog-api',
  'notifications-worker',
] as const;

const LEVELS = ['debug', 'log', 'warn', 'error', 'fatal'] as const;

const MESSAGES: Record<(typeof LEVELS)[number], string> = {
  debug: 'Cache lookup finished in 3ms',
  log: 'Request completed successfully',
  warn: 'Retry scheduled after a slow dependency',
  error: 'Downstream request failed',
  fatal: 'Service cannot reach its database',
};

const LOG_COUNT = 40;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function buildDemoLogs(now: Date): CreateLogDto[] {
  return Array.from({ length: LOG_COUNT }, (_, index) => {
    const level = LEVELS[index % LEVELS.length];
    const service = SERVICES[index % SERVICES.length];
    const age = Math.floor((index * WEEK_MS) / LOG_COUNT);

    return {
      service,
      timestamp: new Date(now.getTime() - age).toISOString(),
      level,
      message: `${MESSAGES[level]} (${service})`,
      metadata: { demo: true, sequence: index },
    };
  });
}

export function buildDemoAnalyses(
  logIds: string[],
  now: Date,
): DemoAnalysis[] {
  const completedAt = new Date(now.getTime() - 60 * 60 * 1000);
  const failedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  return [
    {
      logIds,
      status: AnalysisStatus.Completed,
      provider: 'OpenAI',
      result: {
        summary:
          'Payment retries correlate with a degraded authorization provider.',
        insights: [
          {
            title: 'Repeated payment timeouts',
            description:
              'Payment authorization requests time out during peak traffic.',
            severity: 'high',
          },
          {
            title: 'Noisy retry logging',
            description: 'Retries emit several warning lines per request.',
            severity: 'low',
          },
        ],
      },
      attempts: 1,
      createdAt: new Date(completedAt.getTime() - 30 * 60 * 1000),
      updatedAt: completedAt,
    },
    {
      logIds,
      status: AnalysisStatus.Failed,
      error: 'Analysis failed after all provider retries',
      attempts: 3,
      createdAt: new Date(failedAt.getTime() - 30 * 60 * 1000),
      updatedAt: failedAt,
    },
  ];
}
