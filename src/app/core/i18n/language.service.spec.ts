import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { translocoTesting } from '../../../testing/transloco-testing';
import { LANGUAGE_STORAGE_KEY, LanguageService } from './language.service';

describe('LanguageService', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [translocoTesting()] });
    return {
      service: TestBed.inject(LanguageService),
      transloco: TestBed.inject(TranslocoService),
    };
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('defaults to Spanish and sets <html lang="es-CO">', async () => {
    const { service, transloco } = setup();
    await service.init();

    expect(service.language()).toBe('es');
    expect(transloco.getActiveLang()).toBe('es');
    expect(document.documentElement.lang).toBe('es-CO');
    expect(transloco.translate('settings.title')).toBe('Ajustes');
  });

  it('applies the stored language on the next visit', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    const { service, transloco } = setup();
    await service.init();

    expect(service.language()).toBe('en');
    expect(transloco.getActiveLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('ignores an invalid stored value', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    const { service } = setup();
    await service.init();

    expect(service.language()).toBe('es');
  });

  it('switches at runtime, updates <html lang> and persists the choice', async () => {
    const { service, transloco } = setup();
    await service.init();

    service.setLanguage('en');

    expect(service.language()).toBe('en');
    expect(transloco.getActiveLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(transloco.translate('settings.title')).toBe('Settings');

    service.setLanguage('es');
    expect(document.documentElement.lang).toBe('es-CO');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es');
  });

  it('still switches when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { service } = setup();
    await service.init();

    expect(service.language()).toBe('es');
    expect(() => service.setLanguage('en')).not.toThrow();
    expect(document.documentElement.lang).toBe('en');
  });
});
