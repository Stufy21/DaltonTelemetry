import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'live-timing', pathMatch: 'full' },
  {
    path: 'live-timing',
    loadComponent: () =>
      import('./live-timing/live-timing.component').then((m) => m.LiveTimingComponent),
  },
  {
    path: 'used-elements',
    loadComponent: () =>
      import('./dashboards/used-elements/used-elements.component').then(
        (m) => m.UsedElementsComponent,
      ),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'statistics/:circuitId',
    loadComponent: () =>
      import('./dashboards/circuit-detail/circuit-detail.component').then(
        (m) => m.CircuitDetailComponent,
      ),
  },
  {
    path: 'statistics',
    loadComponent: () =>
      import('./dashboards/statistics/statistics.component').then((m) => m.StatisticsComponent),
  },
  // Statistics used to live under Reports: keep those links working.
  {
    path: 'reports/stats/:circuitId',
    redirectTo: ({ params }) => `/statistics/${params['circuitId']}`,
  },
  { path: 'reports/stats', redirectTo: '/statistics', pathMatch: 'full' },
];
