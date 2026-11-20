import { TestBed } from '@angular/core/testing';
import { Attempt } from '../../../core/api/api.models';
import { AppConfig } from '../../../core/config/app-config';
import { translocoTesting } from '../../../../testing/transloco-testing';
import { AttemptCard, attemptView } from './attempt-card';

function attempt(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'a2',
    status: 'DONE',
    prompt: 'una taza de café humeante al amanecer',
    queuePosition: null,
    imageUrl: '/img/a2.jpg',
    thumbUrl: '/img/a2_thumb.jpg',
    code: null,
    createdAt: '2026-12-02T15:10:00.000Z',
    ...overrides,
  };
}

describe('attempt card (DESIGN.md §7)', () => {
  it.each([
    [
      attempt({ status: 'QUEUED', queuePosition: 4, imageUrl: null, thumbUrl: null }),
      'player.round.attempt.status.queued',
      'placeholder',
      null,
    ],
    [
      attempt({ status: 'QUEUED', imageUrl: null, thumbUrl: null }),
      'player.round.attempt.status.queuedWaiting',
      'placeholder',
      null,
    ],
    [
      attempt({ status: 'GENERATING', imageUrl: null, thumbUrl: null }),
      'player.round.attempt.status.generating',
      'placeholder',
      null,
    ],
    [attempt(), 'player.round.attempt.status.done', 'image', null],
    [
      attempt({ status: 'BLOCKED', imageUrl: null, thumbUrl: null, code: 'PROMPT_BLOCKED' }),
      'player.round.attempt.status.blocked',
      'none',
      'errors.PROMPT_BLOCKED',
    ],
    [
      attempt({ status: 'FAILED', imageUrl: null, thumbUrl: null, code: 'GENERATION_FAILED' }),
      'player.round.attempt.status.failed',
      'none',
      'errors.GENERATION_FAILED',
    ],
    [
      attempt({ status: 'FAILED', imageUrl: null, thumbUrl: null, code: 'ROUND_NOT_OPEN' }),
      'player.round.attempt.status.late',
      'none',
      'player.round.attempt.lateMessage',
    ],
  ])('maps %o', (input, statusKey, media, messageKey) => {
    const view = attemptView(input);
    expect(view.statusKey).toBe(statusKey);
    expect(view.media).toBe(media);
    expect(view.messageKey).toBe(messageKey);
  });

  describe('rendering', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [translocoTesting()],
        providers: [{ provide: AppConfig, useValue: { apiBaseUrl: 'https://api.test' } }],
      });
    });

    async function render(inputs: { attempt: Attempt; selected?: boolean; selectable?: boolean }) {
      const fixture = TestBed.createComponent(AttemptCard);
      fixture.componentRef.setInput('attempt', inputs.attempt);
      fixture.componentRef.setInput('number', 2);
      fixture.componentRef.setInput('selected', inputs.selected ?? false);
      fixture.componentRef.setInput('selectable', inputs.selectable ?? true);
      const requested = vi.fn();
      fixture.componentInstance.selectRequested.subscribe(requested);
      await fixture.whenStable();
      return { element: fixture.nativeElement as HTMLElement, requested };
    }

    it('offers "Submit this one" with the attempt number in its name, and a lazy thumbnail', async () => {
      const { element, requested } = await render({ attempt: attempt() });
      const submit = element.querySelector<HTMLButtonElement>('button.submit')!;
      expect(submit.textContent?.replace(/\s+/g, ' ').trim()).toBe('Enviar esta (intento 2)');
      expect(submit.getAttribute('aria-disabled')).toBeNull();
      const img = element.querySelector<HTMLImageElement>('button.media img')!;
      expect(img.getAttribute('src')).toBe('https://api.test/img/a2_thumb.jpg');
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.alt).toBe('Ampliar el intento 2');
      submit.click();
      expect(requested).toHaveBeenCalledTimes(1);
    });

    it('shows the selected card with a check, "Selected" and no repeat action', async () => {
      const { element, requested } = await render({ attempt: attempt(), selected: true });
      expect(element.querySelector('.card')?.classList).toContain('is-selected');
      const button = element.querySelector<HTMLButtonElement>('button.submit')!;
      expect(button.textContent).toContain('Seleccionada');
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.querySelector('pb-icon')).not.toBeNull();
      button.click();
      expect(requested).not.toHaveBeenCalled();
    });

    it('shows a blocked attempt with its message and its whole prompt, and no image area', async () => {
      const { element } = await render({
        attempt: attempt({
          status: 'BLOCKED',
          imageUrl: null,
          thumbUrl: null,
          code: 'PROMPT_BLOCKED',
        }),
      });
      expect(element.querySelector('.media')).toBeNull();
      expect(element.textContent).toContain('Bloqueada');
      expect(element.textContent).toContain('Ese prompt no está permitido');
      expect(element.textContent).toContain('No gastó un intento.');
      expect(element.querySelector('.prompt')?.classList).not.toContain('clamped');
      expect(element.querySelector('button.submit')).toBeNull();
    });

    it('shows a queued attempt with its position and a placeholder', async () => {
      const { element } = await render({
        attempt: attempt({ status: 'QUEUED', queuePosition: 128, imageUrl: null, thumbUrl: null }),
      });
      expect(element.querySelector('.placeholder')?.getAttribute('aria-hidden')).toBe('true');
      expect(element.textContent).toContain('En cola · posición 128');
      expect(element.querySelector('button.submit')).toBeNull();
    });

    it('shows a read-only "Selected" badge when the round is closed', async () => {
      const { element } = await render({ attempt: attempt(), selected: true, selectable: false });
      expect(element.querySelector('button.submit')).toBeNull();
      expect(element.querySelector('.badge')?.textContent).toContain('Seleccionada');
    });
  });
});
