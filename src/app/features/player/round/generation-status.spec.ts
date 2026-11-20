import { TestBed } from '@angular/core/testing';
import { Attempt } from '../../../core/api/api.models';
import { Announcer } from '../../../core/ui/announcer';
import { translocoTesting } from '../../../../testing/transloco-testing';
import { GenerationInFlight } from '../player-state.service';
import { GenerationStatus, statusLine } from './generation-status';

function attempt(status: Attempt['status'], code: string | null = null): Attempt {
  return {
    id: 'a3',
    status,
    prompt: 'chiva',
    queuePosition: null,
    imageUrl: null,
    thumbUrl: null,
    code,
    createdAt: '2026-12-02T15:10:00.000Z',
  };
}

const queued = (position: number | null): GenerationInFlight => ({
  attemptId: 'a3',
  status: 'QUEUED',
  queuePosition: position,
});

describe('generation status line (DESIGN.md §7)', () => {
  it('describes the generation in flight first, then the newest outcome, else idle', () => {
    expect(statusLine(queued(4), null, 0)).toMatchObject({
      key: 'player.round.status.queued',
      params: { position: 4 },
      tone: 'busy',
    });
    expect(statusLine(queued(null), null, 0).key).toBe('player.round.status.queuedWaiting');
    expect(
      statusLine({ attemptId: 'a3', status: 'GENERATING', queuePosition: null }, null, 0).key,
    ).toBe('player.round.status.generating');
    expect(statusLine(null, attempt('DONE'), 3)).toMatchObject({
      key: 'player.round.status.done',
      params: { number: 3 },
      tone: 'done',
    });
    expect(statusLine(null, attempt('BLOCKED', 'PROMPT_BLOCKED'), 3).tone).toBe('problem');
    expect(statusLine(null, attempt('FAILED', 'GENERATION_FAILED'), 3).key).toBe(
      'player.round.status.failed',
    );
    expect(statusLine(null, attempt('FAILED', 'ROUND_NOT_OPEN'), 3).key).toBe(
      'player.round.status.late',
    );
    expect(statusLine(null, null, 0)).toMatchObject({
      key: 'player.round.status.idle',
      tone: 'idle',
    });
  });

  it('keeps the same state while the queue position moves (shown, not announced)', () => {
    expect(statusLine(queued(4), null, 0).state).toBe(statusLine(queued(3), null, 0).state);
  });

  describe('announcements', () => {
    let announce: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      announce = vi.fn();
      TestBed.configureTestingModule({
        imports: [translocoTesting()],
        providers: [{ provide: Announcer, useValue: { announce } }],
      });
    });

    it('announces status changes politely, never the first render or queue moves', async () => {
      const fixture = TestBed.createComponent(GenerationStatus);
      fixture.componentRef.setInput('generation', queued(4));
      await fixture.whenStable();
      expect(announce).not.toHaveBeenCalled();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('En cola · posición 4');

      fixture.componentRef.setInput('generation', queued(3));
      await fixture.whenStable();
      expect(announce).not.toHaveBeenCalled();

      fixture.componentRef.setInput('generation', {
        attemptId: 'a3',
        status: 'GENERATING',
        queuePosition: null,
      });
      await fixture.whenStable();
      expect(announce).toHaveBeenCalledWith('Compilando tu imagen.', expect.any(Number));

      fixture.componentRef.setInput('generation', null);
      fixture.componentRef.setInput('latest', attempt('DONE'));
      fixture.componentRef.setInput('latestNumber', 3);
      await fixture.whenStable();
      expect(announce).toHaveBeenLastCalledWith('El intento 3 está listo.', expect.any(Number));
      // The visible line is not itself a live region.
      expect((fixture.nativeElement as HTMLElement).querySelector('[aria-live]')).toBeNull();
    });
  });
});
