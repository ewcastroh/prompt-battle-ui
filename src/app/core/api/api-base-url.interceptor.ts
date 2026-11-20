import { HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { AppConfig } from '../config/app-config';

/** True for API paths (`/api/...`, `/img/...`) that must be sent to `API_BASE_URL`. */
export function isApiPath(url: string): boolean {
  return /^\/(api|img)(\/|$)/.test(url);
}

/**
 * Prefixes API paths with the runtime `apiBaseUrl`. Relative app files (`config.json`, `i18n/*.json`)
 * and absolute URLs are left alone.
 */
export function apiBaseUrlInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  if (!isApiPath(req.url)) {
    return next(req);
  }
  const config = inject(AppConfig);
  return next(req.clone({ url: config.apiBaseUrl + req.url }));
}
