import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./jobs/jobs-page').then((m) => m.JobsPage) },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings-page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: '' },
];
