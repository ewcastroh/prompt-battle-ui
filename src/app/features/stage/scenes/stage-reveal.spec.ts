import { TestBed } from '@angular/core/testing';
import { Reveal, RevealEntry } from '../../../core/api/api.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { testAppConfig, stubMotion } from '../../../../testing/dom-stubs';
import { translocoTesting } from '../../../../testing/transloco-testing';
import { StageReveal, currentEntry, rankAtStep } from './stage-reveal';

function entry(rank: number, overrides: Partial<RevealEntry> = {}): RevealEntry {
  return {
    rank,
    nickname: `Jugador${rank}`,
    prompt: `prompt del puesto ${rank}`,
    imageUrl: `/img/e${rank}.jpg`,
    targetUrl: '/img/t.jpg',
    roundName: 'Café al amanecer',
    roundScore: 70 + rank,
    total: 120 + rank,
    commentary: { es: `comentario ${rank}`, en: `comment ${rank}` },
    ...overrides,
  };
}

function podium(step: number, entries: RevealEntry[], size = 5): Reveal {
  return { kind: 'PODIUM', roundId: null, size, step, entries };
}

describe('stage reveal (SPEC §10.5, API.md §4 steps)', () => {
  it('maps steps to ranks: step k reveals size − k + 1; step 0 is the intro', () => {
    expect(rankAtStep({ size: 5, step: 0 })).toBeNull();
    expect(rankAtStep({ size: 5, step: 1 })).toBe(5);
    expect(rankAtStep({ size: 5, step: 5 })).toBe(1);
    expect(rankAtStep({ size: 3, step: 3 })).toBe(1);
    expect(rankAtStep({ size: 3, step: 4 })).toBeNull();
  });

  it('shows the entry of the current step only, never another revealed or missing one', () => {
    const revealed = [entry(5), entry(4)];
    expect(currentEntry(podium(2, revealed))?.rank).toBe(4);
    // Rank 4 hidden after its reveal (D-022): its slot stays empty.
    expect(currentEntry(podium(2, [entry(5)]))).toBeNull();
  });

  describe('component', () => {
    beforeEach(async () => {
      localStorage.clear();
      stubMotion('reduce');
      TestBed.configureTestingModule({ imports: [translocoTesting()], providers: [testAppConfig] });
      await TestBed.inject(LanguageService).init();
    });

    async function render(reveal: Reveal) {
      const fixture = TestBed.createComponent(StageReveal);
      fixture.componentRef.setInput('reveal', reveal);
      await fixture.whenStable();
      return fixture;
    }

    it('renders nothing but the slots at the intro: no images, no names', async () => {
      const fixture = await render(podium(0, []));
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelectorAll('img')).toHaveLength(0);
      expect(element.textContent).toContain('El top 5 de la batalla');
      expect([...element.querySelectorAll('.slot')].map((li) => li.textContent?.trim())).toEqual([
        '#5',
        '#4',
        '#3',
        '#2',
        '#1',
      ]);
    });

    it('renders only revealed entries: the current one beside its target', async () => {
      const fixture = await render(podium(2, [entry(5), entry(4)]));
      const element = fixture.nativeElement as HTMLElement;
      const images = [...element.querySelectorAll('img')].map((img) => img.getAttribute('src'));
      expect(images).toEqual(['http://api.test/img/t.jpg', 'http://api.test/img/e4.jpg']);
      expect(element.textContent).toContain('Jugador4');
      expect(element.textContent).toContain('prompt del puesto 4');
      expect(element.textContent).not.toContain('Jugador5');
      // The final podium counts up the event total (owner choice, U3); the round score is beside it.
      expect(element.querySelector('pb-score-count-up')?.textContent).toContain('124,0');
      expect(element.textContent).toContain('Mejor ronda: Café al amanecer · 74,0');
    });

    it('shows the commentary in the stage language, and follows a language switch', async () => {
      const fixture = await render(podium(1, [entry(5)]));
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('.comment')?.textContent?.trim()).toBe('comentario 5');
      TestBed.inject(LanguageService).setLanguage('en');
      await fixture.whenStable();
      expect(element.querySelector('.comment')?.textContent?.trim()).toBe('comment 5');
    });

    it('marks #1 as the winner (static celebration in any motion setting)', async () => {
      const fixture = await render(
        podium(
          5,
          [5, 4, 3, 2, 1].map((rank) => entry(rank)),
        ),
      );
      expect((fixture.nativeElement as HTMLElement).classList).toContain('winner');
    });

    it('a mini-podium counts up the round score', async () => {
      const fixture = await render({
        kind: 'MINI_PODIUM',
        roundId: 'r1',
        size: 3,
        step: 1,
        entries: [entry(3, { total: null, roundScore: 41.7 })],
      });
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('pb-score-count-up')?.textContent).toContain('41,7');
      expect(element.textContent).not.toContain('Mejor ronda');
    });

    it('says when a revealed place was emptied by a hide', async () => {
      const fixture = await render(podium(2, [entry(5)]));
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'El puesto #4 quedó vacío.',
      );
    });
  });
});
