import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export type AnalysisStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed';

export interface LogEntry {
  id: string;
  service: string;
  timestamp: string;
  level: string;
  message: string;
  ingestedAt: string;
}

export interface AnalysisTask {
  id: string;
  logIds: string[];
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

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class LogsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api';

  listLogs(limit = 20, offset = 0) {
    const params = new HttpParams()
      .set('limit', limit)
      .set('offset', offset);
    return this.http.get<Page<LogEntry>>(`${this.apiUrl}/logs`, { params });
  }

  createLog(payload: {
    service: string;
    timestamp: string;
    level: string;
    message: string;
  }) {
    return this.http.post<LogEntry>(`${this.apiUrl}/logs`, payload);
  }

  enqueueAnalysis(logIds: string[]) {
    return this.http.post<AnalysisTask>(`${this.apiUrl}/logs/analyze`, {
      logIds,
    });
  }

  listAnalyses(limit = 20, offset = 0) {
    const params = new HttpParams()
      .set('limit', limit)
      .set('offset', offset);
    return this.http.get<Page<AnalysisTask>>(`${this.apiUrl}/analysis`, {
      params,
    });
  }

  getAnalysis(id: string) {
    return this.http.get<AnalysisTask>(`${this.apiUrl}/analysis/${id}`);
  }
}
