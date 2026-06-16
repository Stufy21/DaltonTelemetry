import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'settings', pathMatch: 'full' },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'reports/stats',
    loadComponent: () =>
      import('./dashboards/statistics/statistics.component').then((m) => m.StatisticsComponent)
  }
];
