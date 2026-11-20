import { Routes } from '@angular/router';
import { cityGuard } from './core/city/city.guard';

/** SPEC §10.1. City routes are lazy and guarded; unknown cities show `CITY_NOT_FOUND`. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Prompt Battle',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'play/:city',
    title: 'Prompt Battle',
    canActivate: [cityGuard],
    loadComponent: () => import('./features/player/player-shell').then((m) => m.PlayerShell),
  },
  {
    path: 'stage/:city',
    title: 'Prompt Battle',
    canActivate: [cityGuard],
    loadComponent: () => import('./features/stage/stage-shell').then((m) => m.StageShell),
  },
  {
    path: 'admin/:city',
    title: 'Prompt Battle',
    canActivate: [cityGuard],
    loadComponent: () => import('./features/admin/admin-shell').then((m) => m.AdminShell),
  },
  {
    path: 'error',
    title: 'Prompt Battle',
    loadComponent: () => import('./features/error/error-page').then((m) => m.ErrorPage),
  },
  {
    path: '**',
    title: 'Prompt Battle',
    data: { code: 'NOT_FOUND' },
    loadComponent: () => import('./features/error/error-page').then((m) => m.ErrorPage),
  },
];
