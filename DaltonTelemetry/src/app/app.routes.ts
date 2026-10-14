import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'live-timing', pathMatch: 'full' },
  {
    path: 'live-timing',
    loadComponent: () =>
      import('./live-timing/live-timing.component').then((m) => m.LiveTimingComponent),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'reports/stats',
    loadComponent: () =>
      import('./dashboards/statistics/statistics.component').then((m) => m.StatisticsComponent),
  },
];
