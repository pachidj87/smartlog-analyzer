import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeInstanceOf(AppComponent);
  });

  it('should render the SmartLog dashboard header', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const brand: HTMLElement | null =
      fixture.nativeElement.querySelector('header .brand');
    expect(brand?.getAttribute('aria-label')).toBe('SmartLog home');
    expect(brand?.textContent?.trim().toLowerCase()).toContain('smartlog');
  });
});
