import { TestBed } from '@angular/core/testing';
import { Phase, StageState } from '../../core/api/api.models';
import { LanguageService } from '../../core/i18n/language.service';
import { testAppConfig } from '../../../testing/dom-stubs';
import { translocoTesting } from '../../../testing/transloco-testing';
import { StageRound } from './scenes/stage-round';
import { sceneFor, sceneKey } from './stage-scene';
import { shortUrl } from './scenes/stage-lobby';

function state(phase: Phase, overrides: Partial<StageState> = {}): StageState {
  return {
    city: { code: 'mde', name: 'Medellín' },
    phase,
    joinUrl: 'https://prompt-battle-ui.pages.dev/play/mde',
    qrUrl: '/api/cities/mde/qr.png',
    playersCount: 48,
    nicknames: null,
    round: null,
    practiceGallery: null,
    reveal: null,
    hiddenPrompts: null,
    ...overrides,
  };
}

const ROUND = {
  id: 'r1',
  name: 'Café al amanecer',
  scored: true,
  targetUrl: '/img/t.jpg',
  startedAt: '2026-12-02T15:09:00.000Z',
  endsAt: '2026-12-02T15:17:00.000Z',
  submissionsCount: 23,
  attemptsCount: 57,
  status: 'OPEN' as const,
};

describe('stage scenes (SPEC §10.5)', () => {
  it('picks one scene per phase', () => {
    expect(sceneFor(null)).toBe('loading');
    expect(sceneFor(state('LOBBY'))).toBe('lobby');
    expect(
      sceneFor(
        state('LOBBY', { practiceGallery: [{ nickname: 'a', imageUrl: 'x', thumbUrl: 'y' }] }),
      ),
    ).toBe('gallery');
    expect(sceneFor(state('ROUND_OPEN', { round: ROUND }))).toBe('round-open');
    expect(sceneFor(state('ROUND_CLOSING'))).toBe('closing');
    expect(sceneFor(state('ROUND_SCORED'))).toBe('scored');
    expect(sceneFor(state('FINAL_SCORING'))).toBe('final-scoring');
    expect(sceneFor(state('FINISHED'))).toBe('finished');
    const reveal = { kind: 'PODIUM' as const, roundId: null, size: 5, step: 2, entries: [] };
    expect(sceneFor(state('PODIUM_REVEAL', { reveal }))).toBe('reveal');
  });

  it('changes the scene key on every reveal step, not on counters', () => {
    const reveal = { kind: 'PODIUM' as const, roundId: null, size: 5, step: 2, entries: [] };
    expect(sceneKey(state('PODIUM_REVEAL', { reveal }))).not.toBe(
      sceneKey(state('PODIUM_REVEAL', { reveal: { ...reveal, step: 3 } })),
    );
    expect(sceneKey(state('ROUND_OPEN', { round: ROUND }))).toBe(
      sceneKey(state('ROUND_OPEN', { round: { ...ROUND, submissionsCount: 30 } })),
    );
  });

  it('shows the join URL without its scheme', () => {
    expect(shortUrl('https://prompt-battle-ui.pages.dev/play/mde')).toBe(
      'prompt-battle-ui.pages.dev/play/mde',
    );
  });

  describe('round open', () => {
    beforeEach(async () => {
      localStorage.clear();
      TestBed.configureTestingModule({ imports: [translocoTesting()], providers: [testAppConfig] });
      await TestBed.inject(LanguageService).init();
    });

    it('shows the target only: no player image ever appears during an open round (SPEC §6.2)', async () => {
      const fixture = TestBed.createComponent(StageRound);
      fixture.componentRef.setInput('round', ROUND);
      fixture.componentRef.setInput('playersCount', 48);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      const images = [...element.querySelectorAll('img')].map((img) => img.getAttribute('src'));
      expect(images).toEqual(['http://api.test/img/t.jpg']);
      expect(element.textContent).toContain('Entregas: 23 de 48');
      expect(element.querySelector('[role="timer"]')).not.toBeNull();
    });
  });
});
