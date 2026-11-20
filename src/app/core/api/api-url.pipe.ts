import { Pipe, PipeTransform, inject } from '@angular/core';
import { AppConfig } from '../config/app-config';
import { isApiPath } from './api-base-url.interceptor';

/**
 * Resolves an image path from an API response (`/img/….jpg`, `/api/cities/mde/qr.png`) against
 * `API_BASE_URL` for use in `<img src>`, which bypasses HttpClient interceptors.
 * Other values (absolute or `data:` URLs from the fake backend) are returned unchanged.
 */
@Pipe({ name: 'apiUrl' })
export class ApiUrlPipe implements PipeTransform {
  private readonly config = inject(AppConfig);

  transform(path: string | null | undefined): string | null {
    if (!path) {
      return null;
    }
    return isApiPath(path) ? this.config.apiBaseUrl + path : path;
  }
}
