import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LanguageService } from '../../core/i18n/language.service';
import { translocoTesting } from '../../../testing/transloco-testing';
import { ErrorPage } from './error-page';

describe('error page', () => {
  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [provideRouter([])],
    });
    await TestBed.inject(LanguageService).init();
  });

  async function render(code: string | null) {
    const fixture = TestBed.createComponent(ErrorPage);
    fixture.componentRef.setInput('code', code);
    fixture.componentRef.setInput('city', 'mde');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('offers "try again" when the API could not be reached (first load during a network blip)', async () => {
    for (const code of ['NETWORK_ERROR', 'INTERNAL_ERROR', 'UNKNOWN']) {
      const page = await render(code);
      expect(page.querySelector('main button')?.textContent?.trim()).toBe('Reintentar');
      expect(page.querySelector('main a')?.textContent?.trim()).toBe('Ver las ciudades');
    }
  });

  it('has no retry for a wrong city or path: reloading would not help', async () => {
    for (const code of ['CITY_NOT_FOUND', null]) {
      const page = await render(code);
      expect(page.querySelector('main button')).toBeNull();
      expect(page.querySelector('main a')).not.toBeNull();
    }
  });
});
