import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export type AnalysisStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

export type StatsGroupBy = 'service' | 'level';

export interface LogEntry {
  id: string;
  service: string;
  timestamp: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
  ingestedAt: string;
}

export interface AnalysisTask {
  id: string;
  logIds: string[];
  prompt?: string;
  status: AnalysisStatus;
  provider?: string;
  result?: {
    summary: string;
    insights: Array<{
      title: string;
      description: string;
      severity?: string;
    }>;
  };
  error?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeadLetterJob {
  id: string;
  analysisId: string;
  failedReason: string;
  attempts: number;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface LogStats {
  groupBy: StatsGroupBy;
  from: string | null;
  to: string | null;
  total: number;
  buckets: Array<{ key: string; count: number }>;
}

export interface ListLogsParams {
  limit: number;
  offset: number;
  service?: string;
  level?: string;
  from?: string;
  to?: string;
}

export interface ListLogsStatsParams {
  groupBy: StatsGroupBy;
  from?: string;
  to?: string;
}

export interface CreateLogPayload {
  service: string;
  level: LogLevel;
  message: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class LogsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api';

  listLogs(params: ListLogsParams) {
    return this.http.get<Page<LogEntry>>(`${this.apiUrl}/logs`, {
      params: this.buildParams({
        limit: params.limit,
        offset: params.offset,
        service: params.service,
        level: params.level,
        from: params.from,
        to: params.to,
      }),
    });
  }

  listLogsStats(params: ListLogsStatsParams) {
    return this.http.get<LogStats>(`${this.apiUrl}/logs/stats`, {
      params: this.buildParams({
        groupBy: params.groupBy,
        from: params.from,
        to: params.to,
      }),
    });
  }

  createLog(payload: CreateLogPayload) {
    return this.http.post<LogEntry>(`${this.apiUrl}/logs`, {
      ...payload,
      timestamp: payload.timestamp ?? new Date().toISOString(),
    });
  }

  enqueueAnalysis(logIds: string[], prompt = '') {
    return this.http.post<AnalysisTask>(`${this.apiUrl}/logs/analyze`, {
      logIds,
      ...(prompt?.trim() ? { prompt: prompt.trim() } : {}),
    });
  }

  listAnalyses(limit = 20, offset = 0, status?: AnalysisStatus) {
    return this.http.get<Page<AnalysisTask>>(`${this.apiUrl}/analysis`, {
      params: this.buildParams({ limit, offset, status }),
    });
  }

  getAnalysis(id: string) {
    return this.http.get<AnalysisTask>(`${this.apiUrl}/analysis/${id}`);
  }

  listDeadLetters(limit = 20, offset = 0) {
    return this.http.get<Page<DeadLetterJob>>(
      `${this.apiUrl}/analysis/dead-letter`,
      { params: this.buildParams({ limit, offset }) },
    );
  }

  private buildParams(
    values: Record<string, string | number | undefined | null>,
  ): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          continue;
        }
        params = params.set(key, trimmed);
        continue;
      }
      params = params.set(key, value);
    }

    return params;
  }
}
