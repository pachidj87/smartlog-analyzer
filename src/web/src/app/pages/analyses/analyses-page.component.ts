import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  AnalysisStatus,
  AnalysisTask,
  DeadLetterJob,
  LogsApiService,
} from '../../logs-api.service';
import { describeHttpError } from '../../shared/api-error';
import {
  PageChange,
  PaginationComponent,
} from '../../shared/pagination/pagination.component';

export const ANALYSIS_POLL_INTERVAL_MS = 2500;

const PENDING_STATUSES: ReadonlyArray<AnalysisStatus> = [
  'queued',
  'processing',
];

@Component({
  selector: 'app-analyses-page',
  imports: [DatePipe, FormsModule, PaginationComponent],
  templateUrl: './analyses-page.component.html',
  styleUrl: './analyses-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysesPageComponent implements OnInit {
  private readonly api = inject(LogsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses: AnalysisStatus[] = [
    'queued',
    'processing',
    'completed',
    'failed',
  ];

  readonly analyses = signal<AnalysisTask[]>([]);
  readonly total = signal(0);
  readonly limit = signal(20);
  readonly offset = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly deadLetters = signal<DeadLetterJob[]>([]);
  readonly deadLetterError = signal('');

  statusFilter = '';

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  readonly pendingCount = computed(
    () =>
      this.analyses().filter((task) =>
        PENDING_STATUSES.includes(task.status),
      ).length,
  );

  ngOnInit(): void {
    this.load();
    this.loadDeadLetters();
    this.destroyRef.onDestroy(() => this.stopPolling());
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .listAnalyses(
        this.limit(),
        this.offset(),
        this.statusFilter
          ? (this.statusFilter as AnalysisStatus)
          : undefined,
      )
      .subscribe({
        next: (page) => {
          this.loading.set(false);
          this.analyses.set(page.items);
          this.total.set(page.total);
          this.limit.set(page.limit);
          this.offset.set(page.offset);
          this.syncPolling();
        },
        error: (failure: unknown) => {
          this.loading.set(false);
          this.error.set(describeHttpError(failure));
        },
      });
  }

  loadDeadLetters(): void {
    this.deadLetterError.set('');

    this.api.listDeadLetters(10, 0).subscribe({
      next: (page) => this.deadLetters.set(page.items),
      error: (failure: unknown) =>
        this.deadLetterError.set(describeHttpError(failure)),
    });
  }

  applyStatusFilter(): void {
    this.offset.set(0);
    this.load();
  }

  changePage(change: PageChange): void {
    this.limit.set(change.limit);
    this.offset.set(change.offset);
    this.load();
  }

  statusOf(task: AnalysisTask): AnalysisStatus {
    return task.status;
  }

  private syncPolling(): void {
    if (this.pendingCount() === 0) {
      this.stopPolling();
      return;
    }
    if (this.pollHandle !== null) {
      return;
    }
    this.pollHandle = setInterval(
      () => this.refreshPending(),
      ANALYSIS_POLL_INTERVAL_MS,
    );
  }

  private refreshPending(): void {
    const pending = this.analyses().filter((task) =>
      PENDING_STATUSES.includes(task.status),
    );
    if (pending.length === 0) {
      this.stopPolling();
      return;
    }

    for (const task of pending) {
      this.api.getAnalysis(task.id).subscribe({
        next: (updated) => {
          this.analyses.update((list) =>
            list.map((item) => (item.id === updated.id ? updated : item)),
          );
          this.syncPolling();
        },
        error: () => {
          // Keep polling: a transient failure should not stop the loop.
        },
      });
    }
  }

  private stopPolling(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }
}
