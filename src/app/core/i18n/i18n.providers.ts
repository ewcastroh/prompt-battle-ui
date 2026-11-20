import { isDevMode } from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';
import { DEFAULT_LANGUAGE, LANGUAGES } from './language.service';
import { TranslocoHttpLoader } from './transloco-loader';

export function provideI18n() {
  return provideTransloco({
    config: {
      availableLangs: [...LANGUAGES],
      defaultLang: DEFAULT_LANGUAGE,
      fallbackLang: DEFAULT_LANGUAGE,
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
      missingHandler: { logMissingKey: isDevMode() },
    },
    loader: TranslocoHttpLoader,
  });
}
