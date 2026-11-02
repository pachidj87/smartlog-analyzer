import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { interval, startWith, switchMap, takeWhile } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  AnalysisTask,
  LogsApiService,
  LogEntry,
} from './logs-api.service';

@Component({
  selector: 'app-root',
  imports: [DatePipe, FormsModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly api = inject(LogsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly watchedAnalysisIds = new Set<string>();

  readonly logLevels = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
  readonly logs = signal<LogEntry[]>([]);
  readonly tasks = signal<AnalysisTask[]>([]);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly logTotal = signal(0);
  readonly taskTotal = signal(0);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  readonly pollingError = signal('');
  readonly pageSize = 20;

  service = '';
  level = 'error';
  message = '';

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.loading.set(true);
    this.error.set('');
    this.api.listLogs(this.pageSize).subscribe({
      next: (page) => {
        this.logs.set(page.items);
        this.logTotal.set(page.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error));
        this.loading.set(false);
      },
    });
    this.api.listAnalyses(this.pageSize).subscribe({
      next: (page) => {
        this.tasks.set(page.items);
        this.taskTotal.set(page.total);
        page.items
          .filter((task) => this.isActive(task.status))
          .forEach((task) => this.watchAnalysis(task.id));
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error));
      },
    });
  }

  addLog() {
    const service = this.service.trim();
    const message = this.message.trim();
    if (!service || !message) return;

    this.submitting.set(true);
    this.error.set('');
    this.notice.set('');
    this.api
      .createLog({
        service,
        timestamp: new Date().toISOString(),
        level: this.level,
        message,
      })
      .subscribe({
        next: () => {
          this.service = '';
          this.message = '';
          this.submitting.set(false);
          this.notice.set('Log received and stored.');
          this.refresh();
        },
        error: (error: unknown) => {
          this.error.set(this.errorMessage(error));
          this.submitting.set(false);
        },
      });
  }

  toggleLog(id: string, checked: boolean) {
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  analyzeSelected() {
    const logIds = [...this.selectedIds()];
    if (logIds.length === 0) return;

    this.submitting.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.enqueueAnalysis(logIds).subscribe({
      next: (task) => {
        this.tasks.update((tasks) => [task, ...tasks]);
        this.taskTotal.update((total) => total + 1);
        this.selectedIds.set(new Set());
        this.submitting.set(false);
        this.notice.set(`Analysis ${task.id} was queued.`);
        this.watchAnalysis(task.id);
      },
      error: (error: unknown) => {
        this.error.set(this.errorMessage(error));
        this.submitting.set(false);
      },
    });
  }

  statusLabel(status: AnalysisTask['status']) {
    return {
      queued: 'Queued',
      processing: 'Running',
      completed: 'Complete',
      failed: 'Failed',
    }[status];
  }

  trackById(_: number, item: { id: string }) {
    return item.id;
  }

  private watchAnalysis(id: string) {
    if (this.watchedAnalysisIds.has(id)) return;
    this.watchedAnalysisIds.add(id);

    interval(2500)
      .pipe(
        startWith(0),
        switchMap(() => this.api.getAnalysis(id)),
        takeWhile((task) => this.isActive(task.status), true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (task) => {
          this.tasks.update((tasks) =>
            tasks.map((current) => (current.id === id ? task : current)),
          );
        },
        error: (error: unknown) => {
          this.watchedAnalysisIds.delete(id);
          this.pollingError.set(
            `Could not refresh analysis ${id}: ${this.errorMessage(error)}`,
          );
        },
        complete: () => this.watchedAnalysisIds.delete(id),
      });
  }

  private isActive(status: AnalysisTask['status']) {
    return status === 'queued' || status === 'processing';
  }

  private errorMessage(error: unknown) {
    if (error instanceof HttpErrorResponse) {
      return typeof error.error?.message === 'string'
        ? error.error.message
        : error.message;
    }
    return error instanceof Error ? error.message : 'Unexpected request error';
  }
}
