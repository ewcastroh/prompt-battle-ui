import { TestBed } from '@angular/core/testing';
import { FinalResult, Me } from '../../../core/api/api.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { translocoTesting } from '../../../../testing/transloco-testing';
import { FinalScreen, formatTotal } from './final-screen';

function me(final: FinalResult): Me {
  return {
    player: { id: 'p', nickname: 'Ana_dev', claimCode: 'K7QX', city: 'mde', cityName: 'Medellín' },
    phase: 'FINISHED',
    round: null,
    attempts: [],
    final,
  };
}

describe('final result (SPEC §3.5)', () => {
  it('formats totals with one decimal in the active locale', () => {
    expect(formatTotal(143.2, 'es-CO')).toBe('143,2');
    expect(formatTotal(143.2, 'en')).toBe('143.2');
    expect(formatTotal(0, 'en')).toBe('0.0');
  });

  describe('screen', () => {
    beforeEach(async () => {
      localStorage.clear();
      TestBed.configureTestingModule({ imports: [translocoTesting()] });
      await TestBed.inject(LanguageService).init();
    });

    async function render(final: FinalResult) {
      const fixture = TestBed.createComponent(FinalScreen);
      fixture.componentRef.setInput('me', me(final));
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    }

    it('shows the rank and total, without the podium message off the podium', async () => {
      const element = await render({ rank: 7, total: 143.2, podium: false });
      expect(element.textContent).toContain('Tu puesto en Medellín');
      expect(element.textContent).toContain('#7');
      expect(element.textContent).toContain('143,2 puntos');
      expect(element.textContent).not.toContain('podio');
    });

    it('tells podium players to show their claim code (SPEC copy)', async () => {
      const element = await render({ rank: 2, total: 171.3, podium: true });
      expect(element.querySelector('h2')?.textContent?.trim()).toBe(
        '¡Estás en el podio! Muestra tu código K7QX',
      );
    });

    it('explains a missing rank', async () => {
      const element = await render({ rank: null, total: 0, podium: false });
      expect(element.textContent).toContain('no tienes puesto');
      expect(element.textContent).not.toContain('#');
    });
  });
});
