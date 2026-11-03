import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LogsApiService } from './logs-api.service';

describe('LogsApiService', () => {
  let service: LogsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LogsApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(LogsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('lists logs with pagination and filters', () => {
    const page = { items: [], total: 0, limit: 10, offset: 20 };
    let received: unknown;

    service
      .listLogs({
        limit: 10,
        offset: 20,
        service: 'payment-api',
        level: 'error',
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-11-03T00:00:00.000Z',
      })
      .subscribe((value) => (received = value));

    const request = http.expectOne('/api/logs?limit=10&offset=20&service=payment-api&level=error&from=2026-11-01T00:00:00.000Z&to=2026-11-03T00:00:00.000Z');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('service')).toBe('payment-api');
    expect(request.request.params.get('level')).toBe('error');
    expect(request.request.params.get('from')).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    request.flush(page);

    expect(received).toEqual(page);
  });

  it('omits blank filters from the logs query', () => {
    service
      .listLogs({ limit: 20, offset: 0, service: '', level: '   ' })
      .subscribe();

    const request = http.expectOne('/api/logs?limit=20&offset=0');
    expect(request.request.params.has('service')).toBeFalse();
    expect(request.request.params.has('level')).toBeFalse();
    expect(request.request.params.has('from')).toBeFalse();
    expect(request.request.params.has('to')).toBeFalse();
    request.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('lists log stats by bucket with an optional range', () => {
    const stats = {
      groupBy: 'level' as const,
      from: '2026-11-01T00:00:00.000Z',
      to: null,
      total: 3,
      buckets: [{ key: 'error', count: 3 }],
    };
    let received: unknown;

    service
      .listLogsStats({
        groupBy: 'level',
        from: '2026-11-01T00:00:00.000Z',
      })
      .subscribe((value) => (received = value));

    const request = http.expectOne(
      '/api/logs/stats?groupBy=level&from=2026-11-01T00:00:00.000Z',
    );
    expect(request.request.params.has('to')).toBeFalse();
    request.flush(stats);

    expect(received).toEqual(stats);
  });

  it('lists dead-letter jobs with pagination', () => {
    const page = { items: [], total: 0, limit: 5, offset: 10 };

    service.listDeadLetters(5, 10).subscribe();

    const request = http.expectOne(
      '/api/analysis/dead-letter?limit=5&offset=10',
    );
    request.flush(page);
  });

  it('lists analyses with an optional status filter', () => {
    service.listAnalyses(20, 0, 'failed').subscribe();
    http
      .expectOne('/api/analysis?limit=20&offset=0&status=failed')
      .flush({ items: [], total: 0, limit: 20, offset: 0 });

    service.listAnalyses(20, 0).subscribe();
    const unfiltered = http.expectOne('/api/analysis?limit=20&offset=0');
    expect(unfiltered.request.params.has('status')).toBeFalse();
    unfiltered.flush({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('defaults the ingestion timestamp to now', () => {
    service
      .createLog({ service: 'payment-api', level: 'warn', message: 'slow' })
      .subscribe();

    const request = http.expectOne('/api/logs');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.service).toBe('payment-api');
    expect(request.request.body.timestamp).toEqual(jasmine.any(String));
    expect(Number.isNaN(Date.parse(request.request.body.timestamp))).toBeFalse();
    request.flush({});
  });
});
