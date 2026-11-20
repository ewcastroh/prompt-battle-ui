import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

/**
 * Loads `public/i18n/{lang}.json`. The path is relative (no leading slash) so it resolves against the
 * base href, and the API base URL interceptor leaves it alone.
 */
@Service()
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`i18n/${lang}.json`);
  }
}
