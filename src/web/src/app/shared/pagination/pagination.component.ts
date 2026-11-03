import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface PageChange {
  limit: number;
  offset: number;
}

@Component({
  selector: 'app-pagination',
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationComponent {
  readonly total = input.required<number>();
  readonly limit = input.required<number>();
  readonly offset = input.required<number>();

  readonly pageChange = output<PageChange>();

  readonly pageSizes = [10, 20, 50];

  readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : this.offset() + 1,
  );
  readonly rangeEnd = computed(() =>
    Math.min(this.offset() + this.limit(), this.total()),
  );
  readonly canGoPrevious = computed(() => this.offset() > 0);
  readonly canGoNext = computed(
    () => this.offset() + this.limit() < this.total(),
  );

  goPrevious(): void {
    if (!this.canGoPrevious()) {
      return;
    }
    this.pageChange.emit({
      limit: this.limit(),
      offset: Math.max(0, this.offset() - this.limit()),
    });
  }

  goNext(): void {
    if (!this.canGoNext()) {
      return;
    }
    this.pageChange.emit({
      limit: this.limit(),
      offset: this.offset() + this.limit(),
    });
  }

  changePageSize(size: string | number): void {
    const limit = Number(size);
    if (!Number.isFinite(limit) || limit <= 0 || limit === this.limit()) {
      return;
    }
    this.pageChange.emit({ limit, offset: 0 });
  }
}
