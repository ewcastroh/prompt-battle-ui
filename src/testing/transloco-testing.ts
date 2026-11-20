import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../public/i18n/en.json';
import es from '../../public/i18n/es.json';

/** Transloco with the real translation files, preloaded, Spanish active. */
export function translocoTesting() {
  return TranslocoTestingModule.forRoot({
    langs: { es, en },
    translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es', fallbackLang: 'es' },
    preloadLangs: true,
  });
}

export { en, es };
