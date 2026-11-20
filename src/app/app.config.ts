import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { apiBaseUrlInterceptor } from './core/api/api-base-url.interceptor';
import { problemInterceptor } from './core/api/problem.interceptor';
import { AppConfig } from './core/config/app-config';
import { provideI18n } from './core/i18n/i18n.providers';
import { LanguageService } from './core/i18n/language.service';
import {
  fakeBackendInterceptors,
  fakeBackendProviders,
} from './fake-backend/fake-backend.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(
      withFetch(),
      // The fake backend (build configuration `fake` only) sits last, where the network would be,
      // so the problem interceptor sees its errors exactly like real API errors.
      withInterceptors([apiBaseUrlInterceptor, problemInterceptor, ...fakeBackendInterceptors]),
    ),
    provideI18n(),
    // Runtime config (D-017) and the first language load before routing.
    provideAppInitializer(() => inject(AppConfig).load()),
    provideAppInitializer(() => inject(LanguageService).init()),
    // `fake` build only (dev tools around the in-browser fake API); empty in real builds.
    ...fakeBackendProviders,
    provideRouter(routes, withComponentInputBinding()),
  ],
};
