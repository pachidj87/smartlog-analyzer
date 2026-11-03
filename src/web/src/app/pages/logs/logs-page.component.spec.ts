import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';

import { LogEntry, LogsApiService } from '../../logs-api.service';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { LogsPageComponent } from './logs-page.component';

describe('LogsPageComponent', () => {
  let fixture: ComponentFixture<LogsPageComponent>;
  let component: LogsPageComponent;
  let api: jasmine.SpyObj<LogsApiService>;

  const log: LogEntry = {
    id: 'log-1',
    service: 'payment-api',
    timestamp: '2026-11-03T10:00:00.000Z',
    level: 'error',
    message: 'Downstream request failed',
    ingestedAt: '2026-11-03T10:00:01.000Z',
  };

  const page = (items: LogEntry[], total = items.length, offset = 0) => ({
    items,
    total,
    limit: 20,
    offset,
  });

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
    api.listLogs.and.returnValue(of(page([])));

    TestBed.configureTestingModule({
      imports: [LogsPageComponent],
      providers: [{ provide: LogsApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(LogsPageComponent);
    component = fixture.componentInstance;
  });

  it('renders the returned rows', () => {
    api.listLogs.and.returnValue(of(page([log])));

    fixture.detectChanges();

    expect(text()).toContain('payment-api');
    expect(text()).toContain('Downstream request failed');
    expect(text()).toContain('error');
  });

  it('shows the empty state when there are no logs', () => {
    fixture.detectChanges();

    expect(text()).toContain('Todavía no hay registros');
    expect(fixture.nativeElement.querySelector('tbody')).toBeNull();
  });

  it('renders the API message when the request is rejected', () => {
    api.listLogs.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'limit must not be greater than 100' },
          }),
      ),
    );

    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('[role="alert"]');
    expect(banner.textContent).toContain('limit must not be greater than 100');
  });

  it('requests the next page when pagination emits', () => {
    api.listLogs.and.returnValue(of(page([log], 84, 0)));
    fixture.detectChanges();

    const pagination = fixture.debugElement.query(
      By.directive(PaginationComponent),
    ).componentInstance as PaginationComponent;
    pagination.pageChange.emit({ limit: 20, offset: 20 });
    fixture.detectChanges();

    expect(api.listLogs.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ limit: 20, offset: 20 }),
    );
  });

  it('falls back to the last valid offset when the page is empty', () => {
    api.listLogs.and.callFake((params) => {
      if (params.offset === 60) {
        return of(page([], 45, 60));
      }
      if (params.offset === 40) {
        return of(page([log], 45, 40));
      }
      return of(page([log], 45, 0));
    });

    fixture.detectChanges();
    component.changePage({ limit: 20, offset: 60 });
    fixture.detectChanges();

    expect(api.listLogs.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ offset: 40 }),
    );
    expect(text()).toContain('payment-api');
  });

  it('shows the prompt above the table and queues analysis with it', () => {
    api.listLogs.and.returnValue(of(page([log])));
    api.enqueueAnalysis.and.returnValue(
      of({
        id: 'analysis-1',
        logIds: [log.id],
        status: 'queued',
        attempts: 0,
        createdAt: '2026-11-03T10:00:00.000Z',
        updatedAt: '2026-11-03T10:00:00.000Z',
      }),
    );
    fixture.detectChanges();

    const checkbox = fixture.nativeElement.querySelector(
      'tbody input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.logs__analysis-prompt'),
    ).not.toBeNull();

    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    const analyzeButton = Array.from(buttons).find((button) =>
      button.textContent?.includes('Analizar seleccionados'),
    );
    expect(analyzeButton).toBeDefined();
    if (!analyzeButton) {
      return;
    }
    analyzeButton.click();
    fixture.detectChanges();

    const promptForm = fixture.nativeElement.querySelector(
      '.logs__analysis-prompt',
    ) as HTMLFormElement;
    const table = fixture.nativeElement.querySelector('table');
    expect(promptForm).not.toBeNull();
    expect(promptForm.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();

    const promptInput = promptForm.querySelector(
      'textarea[name="analysisPrompt"]',
    ) as HTMLTextAreaElement;
    expect(promptInput.maxLength).toBe(4000);
    expect(promptInput.required).toBeTrue();
    const submitButton = promptForm.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    const setPrompt = (value: string) => {
      component.analysisPrompt.set(value);
      fixture.detectChanges();
    };
    expect(submitButton.disabled).toBeTrue();

    setPrompt('   ');
    expect(submitButton.disabled).toBeTrue();
    component.analyzeSelected();
    expect(api.enqueueAnalysis).not.toHaveBeenCalled();

    setPrompt('a'.repeat(4001));
    expect(submitButton.disabled).toBeTrue();
    expect(component.analysisPromptValidationMessage).toContain('4.000');
    component.analyzeSelected();
    expect(api.enqueueAnalysis).not.toHaveBeenCalled();

    setPrompt('Find recurring timeout errors');
    expect(submitButton.disabled).toBeFalse();
    expect(component.analysisPrompt()).toBe('Find recurring timeout errors');
    promptForm.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(api.enqueueAnalysis).toHaveBeenCalledWith(
      [log.id],
      'Find recurring timeout errors',
    );
    expect(text()).toContain('Análisis analysis-1 encolado');
    expect(
      fixture.nativeElement.querySelector('.logs__analysis-prompt'),
    ).toBeNull();
  });

  it('ingests a log with the form values', () => {
    api.createLog.and.returnValue(of(log));
    fixture.detectChanges();

    component.newService = 'auth-service';
    component.newLevel = 'warn';
    component.newMessage = 'Slow dependency';
    component.ingest();

    expect(api.createLog).toHaveBeenCalledWith({
      service: 'auth-service',
      level: 'warn',
      message: 'Slow dependency',
    });
  });
});
