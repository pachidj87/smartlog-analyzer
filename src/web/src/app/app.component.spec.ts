import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { AnalysesPageComponent } from './pages/analyses/analyses-page.component';
import { LogsPageComponent } from './pages/logs/logs-page.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
      ],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeInstanceOf(AppComponent);
  });

  it('renders the brand and the primary navigation', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const brand = fixture.nativeElement.querySelector(
      'header .brand',
    ) as HTMLElement;
    expect(brand.getAttribute('aria-label')).toBe('Inicio de SmartLog');
    expect(brand.textContent?.trim().toLowerCase()).toContain('smartlog');

    const links = Array.from(
      fixture.nativeElement.querySelectorAll('nav a'),
    ) as HTMLAnchorElement[];
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Registros',
      'Análisis',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/logs',
      '/analyses',
    ]);
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('keeps the analysis prompt out of the header', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('header textarea[name="analysisPrompt"]'),
    ).toBeNull();
  });

  it('maps every expected route', () => {
    const byPath = new Map(routes.map((route) => [route.path, route]));

    expect(byPath.get('')?.redirectTo).toBe('logs');
    expect(byPath.get('')?.pathMatch).toBe('full');
    expect(byPath.get('logs')?.component).toBe(LogsPageComponent);
    expect(byPath.get('analyses')?.component).toBe(AnalysesPageComponent);
    expect(byPath.get('**')?.redirectTo).toBe('logs');
  });
});
