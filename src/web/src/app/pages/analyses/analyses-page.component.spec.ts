import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';

import {
  AnalysisTask,
  DeadLetterJob,
  LogsApiService,
} from '../../logs-api.service';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import {
  ANALYSIS_POLL_INTERVAL_MS,
  AnalysesPageComponent,
} from './analyses-page.component';

describe('AnalysesPageComponent', () => {
  let fixture: ComponentFixture<AnalysesPageComponent>;
  let component: AnalysesPageComponent;
  let api: jasmine.SpyObj<LogsApiService>;

  const task = (overrides: Partial<AnalysisTask> = {}): AnalysisTask => ({
    id: 'analysis-1',
    logIds: ['log-1', 'log-2'],
    status: 'queued',
    attempts: 0,
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    ...overrides,
  });

  const page = (
    items: AnalysisTask[],
    total = items.length,
    offset = 0,
  ) => ({ items, total, limit: 20, offset });

  const text = () =>
    (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    api = jasmine.createSpyObj<LogsApiService>('LogsApiService', [
      'listLogs',
      'listAnalyses',
      'listDeadLetters',
      'listLogsStats',
      'createLog',
      'enqueueAnalysis',
      'getAnalysis',
    ]);
    api.listAnalyses.and.returnValue(of(page([])));
    api.listDeadLetters.and.returnValue(
      of({ items: [], total: 0, limit: 10, offset: 0 }),
    );

    TestBed.configureTestingModule({
      imports: [AnalysesPageComponent],
      providers: [{ provide: LogsApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(AnalysesPageComponent);
    component = fixture.componentInstance;
  });

  it('renders status badges and result insights', () => {
    api.listAnalyses.and.returnValue(
      of(
        page([
          task({
            status: 'completed',
            provider: 'OpenAI',
            result: {
              summary: 'Repeated payment timeouts',
              insights: [
                {
                  title: 'Timeout spike',
                  description: 'Payment gateway timed out 12 times.',
                  severity: 'high',
                },
              ],
            },
          }),
        ]),
      ),
    );

    fixture.detectChanges();

    expect(text()).toContain('completed');
    expect(text()).toContain('OpenAI');
    expect(text()).toContain('Repeated payment timeouts');
    expect(text()).toContain('Timeout spike');
  });

  it('polls pending jobs and stops once the job completes', fakeAsync(() => {
    api.listAnalyses.and.returnValue(of(page([task()])));
    api.getAnalysis.and.returnValue(of(task({ status: 'completed' })));

    fixture.detectChanges();
    expect(api.getAnalysis).not.toHaveBeenCalled();

    tick(ANALYSIS_POLL_INTERVAL_MS);
    fixture.detectChanges();

    expect(api.getAnalysis).toHaveBeenCalledTimes(1);
    expect(api.getAnalysis).toHaveBeenCalledWith('analysis-1');
    expect(text()).toContain('completed');

    tick(ANALYSIS_POLL_INTERVAL_MS * 3);

    expect(api.getAnalysis).toHaveBeenCalledTimes(1);
    discardPeriodicTasks();
  }));

  it('keeps polling while a job is still processing', fakeAsync(() => {
    api.listAnalyses.and.returnValue(of(page([task({ status: 'processing' })])));
    api.getAnalysis.and.returnValue(of(task({ status: 'processing' })));

    fixture.detectChanges();
    tick(ANALYSIS_POLL_INTERVAL_MS);

    expect(api.getAnalysis).toHaveBeenCalledTimes(1);

    tick(ANALYSIS_POLL_INTERVAL_MS);

    expect(api.getAnalysis).toHaveBeenCalledTimes(2);
    discardPeriodicTasks();
  }));

  it('shows the failure reason for a failed job', () => {
    api.listAnalyses.and.returnValue(
      of(
        page([
          task({
            status: 'failed',
            error: 'Provider timed out after 30s',
            attempts: 3,
          }),
        ]),
      ),
    );

    fixture.detectChanges();

    expect(text()).toContain('failed');
    expect(text()).toContain('Provider timed out after 30s');
    expect(text()).toContain('3 attempt(s)');
  });

  it('renders dead letters with reason and attempts', () => {
    const deadLetter: DeadLetterJob = {
      id: 'dlq-1',
      analysisId: 'analysis-9',
      failedReason: 'Provider returned an unexpected payload',
      attempts: 5,
      createdAt: '2026-11-03T09:00:00.000Z',
    };
    api.listDeadLetters.and.returnValue(
      of({ items: [deadLetter], total: 1, limit: 10, offset: 0 }),
    );

    fixture.detectChanges();

    expect(text()).toContain('analysis-9');
    expect(text()).toContain('Provider returned an unexpected payload');
    expect(text()).toContain('5 attempt(s)');
  });

  it('reports the API message when the list request fails', () => {
    api.listAnalyses.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'status must be a valid enum value' },
          }),
      ),
    );

    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('[role="alert"]');
    expect(banner.textContent).toContain('status must be a valid enum value');
  });

  it('requests the filtered status and the next page', () => {
    fixture.detectChanges();

    component.statusFilter = 'failed';
    component.applyStatusFilter();
    fixture.detectChanges();

    expect(api.listAnalyses.calls.mostRecent().args).toEqual([
      20,
      0,
      'failed',
    ]);

    const pagination = fixture.debugElement.query(
      By.directive(PaginationComponent),
    ).componentInstance as PaginationComponent;
    pagination.pageChange.emit({ limit: 20, offset: 40 });
    fixture.detectChanges();

    expect(api.listAnalyses.calls.mostRecent().args).toEqual([
      20,
      40,
      'failed',
    ]);
  });
});
