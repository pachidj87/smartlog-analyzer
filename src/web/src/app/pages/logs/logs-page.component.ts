import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  LogEntry,
  LogLevel,
  LogsApiService,
} from '../../logs-api.service';
import { describeHttpError } from '../../shared/api-error';
import {
  PageChange,
  PaginationComponent,
} from '../../shared/pagination/pagination.component';

@Component({
  selector: 'app-logs-page',
  imports: [DatePipe, FormsModule, PaginationComponent],
  templateUrl: './logs-page.component.html',
  styleUrl: './logs-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogsPageComponent implements OnInit {
  private readonly api = inject(LogsApiService);

  readonly logLevels: LogLevel[] = [
    'verbose',
    'debug',
    'log',
    'warn',
    'error',
    'fatal',
  ];

  readonly logs = signal<LogEntry[]>([]);
  readonly total = signal(0);
  readonly limit = signal(20);
  readonly offset = signal(0);
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly analysisPromptOpen = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  filterService = '';
  filterLevel = '';
  filterFrom = '';
  filterTo = '';

  newService = '';
  newLevel: LogLevel = 'log';
  newMessage = '';
  readonly analysisPrompt = signal('');

  get analysisPromptValidationMessage(): string {
    const prompt = this.analysisPrompt();
    if (!prompt.trim()) {
      return 'Escribe las instrucciones para el análisis.';
    }
    if (prompt.length > 4000) {
      return 'El prompt no puede superar los 4.000 caracteres.';
    }
    return '';
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .listLogs({
        limit: this.limit(),
        offset: this.offset(),
        service: this.filterService || undefined,
        level: this.filterLevel || undefined,
        from: this.toIso(this.filterFrom),
        to: this.toIso(this.filterTo, true),
      })
      .subscribe({
        next: (page) => {
          this.loading.set(false);
          this.total.set(page.total);
          this.selectedIds.set(new Set());

          const lastValidOffset =
            page.total === 0
              ? 0
              : Math.floor((page.total - 1) / Math.max(1, page.limit)) *
                page.limit;

          if (
            page.items.length === 0 &&
            page.offset > 0 &&
            lastValidOffset !== page.offset
          ) {
            this.offset.set(lastValidOffset);
            this.load();
            return;
          }

          this.logs.set(page.items);
          this.limit.set(page.limit);
          this.offset.set(page.offset);
        },
        error: (failure: unknown) => {
          this.loading.set(false);
          this.error.set(describeHttpError(failure));
        },
      });
  }

  applyFilters(): void {
    this.offset.set(0);
    this.load();
  }

  resetFilters(): void {
    this.filterService = '';
    this.filterLevel = '';
    this.filterFrom = '';
    this.filterTo = '';
    this.offset.set(0);
    this.load();
  }

  changePage(change: PageChange): void {
    this.limit.set(change.limit);
    this.offset.set(change.offset);
    this.load();
  }

  toggleLog(id: string, checked: boolean): void {
    const next = new Set(this.selectedIds());
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.selectedIds.set(next);
    this.analysisPromptOpen.set(next.size > 0);
  }

  openAnalysisPrompt(): void {
    if (this.selectedIds().size > 0) {
      this.analysisPromptOpen.set(true);
    }
  }

  cancelAnalysis(): void {
    this.analysisPromptOpen.set(false);
    this.analysisPrompt.set('');
  }

  analyzeSelected(): void {
    const logIds = [...this.selectedIds()];
    if (logIds.length === 0 || this.analysisPromptValidationMessage) {
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    this.notice.set('');

    this.api.enqueueAnalysis(logIds, this.analysisPrompt().trim()).subscribe({
      next: (task) => {
        this.submitting.set(false);
        this.analysisPromptOpen.set(false);
        this.analysisPrompt.set('');
        this.selectedIds.set(new Set());
        this.notice.set(
          `Análisis ${task.id} encolado para ${logIds.length} registro(s).`,
        );
      },
      error: (failure: unknown) => {
        this.submitting.set(false);
        this.error.set(describeHttpError(failure));
      },
    });
  }

  ingest(): void {
    const service = this.newService.trim();
    const message = this.newMessage.trim();
    if (!service || !message) {
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    this.notice.set('');

    this.api
      .createLog({ service, level: this.newLevel, message })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.newMessage = '';
          this.notice.set('Registro guardado.');
          this.load();
        },
        error: (failure: unknown) => {
          this.submitting.set(false);
          this.error.set(describeHttpError(failure));
        },
      });
  }

  private toIso(value: string, endOfDay = false): string | undefined {
    if (!value) {
      return undefined;
    }
    const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
    const date = new Date(`${value}T${time}`);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
}
