import { DOCUMENT, Service, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { filter, firstValueFrom } from 'rxjs';

export const LANGUAGES = ['es', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'es';

/** localStorage key for the per-device language choice (SPEC §10.2). */
export const LANGUAGE_STORAGE_KEY = 'lang';

/** BCP 47 tags for `<html lang>` and `Intl` (DESIGN.md §9). */
export const LOCALE_TAGS: Readonly<Record<Language, string>> = { es: 'es-CO', en: 'en' };

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * Active UI language. Spanish by default; the choice is stored per device and applied on the next
 * visit. Switching updates Transloco and `<html lang>` at runtime, without a reload.
 */
@Service()
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly current = signal<Language>(DEFAULT_LANGUAGE);
  private readonly loads = signal(0);

  readonly language = this.current.asReadonly();
  /**
   * Changes each time a translation file finishes loading. A switch to a language that isn't loaded
   * yet changes `language()` first, while `translate()` still returns keys; a `computed` that calls
   * `translate()` reads this too, so it runs again once the file is there.
   */
  readonly translationsLoaded = this.loads.asReadonly();

  constructor() {
    this.transloco.events$
      .pipe(
        filter((event) => event.type === 'translationLoadSuccess'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.loads.update((count) => count + 1));
  }

  /** Applies the stored language (or the default) and waits for its translations. */
  async init(): Promise<void> {
    const stored = this.readStored();
    this.apply(stored ?? DEFAULT_LANGUAGE);
    await firstValueFrom(this.transloco.load(this.current()));
  }

  setLanguage(language: Language): void {
    this.apply(language);
    try {
      this.document.defaultView?.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Storage blocked: the language still applies for this visit.
    }
  }

  localeTag(): string {
    return LOCALE_TAGS[this.current()];
  }

  private apply(language: Language): void {
    this.current.set(language);
    this.transloco.setActiveLang(language);
    this.document.documentElement.lang = LOCALE_TAGS[language];
  }

  private readStored(): Language | null {
    try {
      const value = this.document.defaultView?.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return isLanguage(value) ? value : null;
    } catch {
      return null;
    }
  }
}
