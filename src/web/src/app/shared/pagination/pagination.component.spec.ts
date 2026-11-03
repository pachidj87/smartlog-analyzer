import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PageChange, PaginationComponent } from './pagination.component';

describe('PaginationComponent', () => {
  let fixture: ComponentFixture<PaginationComponent>;
  let component: PaginationComponent;
  let changes: PageChange[];

  const render = (total: number, limit: number, offset: number) => {
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('limit', limit);
    fixture.componentRef.setInput('offset', offset);
    fixture.detectChanges();
  };

  const text = () =>
    (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ').trim();

  const buttons = () =>
    Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PaginationComponent] });
    fixture = TestBed.createComponent(PaginationComponent);
    component = fixture.componentInstance;
    changes = [];
    component.pageChange.subscribe((change) => changes.push(change));
  });

  it('shows the visible range for the current page', () => {
    render(84, 20, 0);

    expect(text()).toContain('Showing 1–20 of 84');
  });

  it('shows the last partial page range', () => {
    render(84, 20, 80);

    expect(text()).toContain('Showing 81–84 of 84');
  });

  it('disables previous on the first page and next on the last page', () => {
    render(84, 20, 0);
    expect(buttons()[0].disabled).toBeTrue();
    expect(buttons()[1].disabled).toBeFalse();

    render(84, 20, 80);
    expect(buttons()[0].disabled).toBeFalse();
    expect(buttons()[1].disabled).toBeTrue();
  });

  it('emits the next offset', () => {
    render(84, 20, 20);

    buttons()[1].click();

    expect(changes).toEqual([{ limit: 20, offset: 40 }]);
  });

  it('emits the previous offset', () => {
    render(84, 20, 40);

    buttons()[0].click();

    expect(changes).toEqual([{ limit: 20, offset: 20 }]);
  });

  it('resets the offset when the page size changes', () => {
    render(84, 20, 40);

    const select = fixture.nativeElement.querySelector(
      'select',
    ) as HTMLSelectElement;
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(changes).toEqual([{ limit: 50, offset: 0 }]);
  });
});
