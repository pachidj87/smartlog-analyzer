import { Routes } from '@angular/router';

import { AnalysesPageComponent } from './pages/analyses/analyses-page.component';
import { LogsPageComponent } from './pages/logs/logs-page.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'logs' },
  { path: 'logs', component: LogsPageComponent },
  { path: 'analyses', component: AnalysesPageComponent },
  { path: '**', redirectTo: 'logs' },
];
