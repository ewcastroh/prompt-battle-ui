import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiError } from '../../../core/api/api-error';
import { Attempt, Me } from '../../../core/api/api.models';
import { AppConfig } from '../../../core/config/app-config';
import { Announcer } from '../../../core/ui/announcer';
import { translocoTesting } from '../../../../testing/transloco-testing';
import { GenerationInFlight, PlayerStateService } from '../player-state.service';
import { RoundOpenScreen, draftStorageKey } from './round-open-screen';

function attempt(id: string, prompt: string): Attempt {
  return {
    id,
    status: 'DONE',
    prompt,
    queuePosition: null,
    imageUrl: `/img/${id}.jpg`,
    thumbUrl: `/img/${id}_thumb.jpg`,
    code: null,
    createdAt: '2026-12-02T15:10:00.000Z',
  };
}

function me(attempts: Attempt[], attemptsLeft = 3): Me {
  return {
    player: { id: 'p', nickname: 'Ana_dev', claimCode: 'K7QX', city: 'mde', cityName: 'Medellín' },
    phase: 'ROUND_OPEN',
    round: {
      id: 'r1',
      name: 'Café al amanecer',
      scored: true,
      targetUrl: '/img/t.jpg',
      targetThumbUrl: '/img/t_thumb.jpg',
      startedAt: '2026-12-02T15:09:00.000Z',
      endsAt: new Date(Date.now() + 300_000).toISOString(),
      attemptsPerPlayer: 3,
      attemptsLeft,
      entryAttemptId: null,
    },
    attempts,
    final: null,
  };
}

describe('RoundOpenScreen (SPEC §10.4, D-024)', () => {
  let generate: ReturnType<typeof vi.fn>;
  let announce: ReturnType<typeof vi.fn>;
  let generation: ReturnType<typeof signal<GenerationInFlight | null>>;

  beforeEach(() => {
    sessionStorage.clear();
    generate = vi.fn().mockResolvedValue(null);
    announce = vi.fn();
    generation = signal<GenerationInFlight | null>(null);
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        { provide: AppConfig, useValue: { apiBaseUrl: 'https://api.test' } },
        { provide: Announcer, useValue: { announce, modalOpened: vi.fn(), modalClosed: vi.fn() } },
        {
          provide: PlayerStateService,
          useValue: {
            generate,
            selectEntry: vi.fn().mockResolvedValue(null),
            generation,
            serverOffset: signal(0),
            entryAttemptId: signal<string | null>(null),
            submitting: signal(false),
          },
        },
      ],
    });
  });

  afterEach(() => sessionStorage.clear());

  async function render(state: Me) {
    const fixture = TestBed.createComponent(RoundOpenScreen);
    fixture.componentRef.setInput('me', state);
    fixture.componentRef.setInput('city', 'mde');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const textarea = element.querySelector<HTMLTextAreaElement>('textarea')!;
    const generateButton = element.querySelector<HTMLButtonElement>('pb-generate-button button')!;
    const type = async (value: string) => {
      textarea.value = value;
      textarea.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const press = async () => {
      generateButton.click();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    return { fixture, element, textarea, generateButton, type, press };
  }

  it('caps the prompt at 300 with a counter and attempts left linked to the field', async () => {
    const { element, textarea, type } = await render(me([]));
    expect(textarea.maxLength).toBe(300);
    expect(textarea.required).toBe(true);
    const counter = element.querySelector('.counter')!;
    expect(counter.textContent).toContain('0 / 300');
    expect(element.textContent).toContain('Intentos restantes: 3');
    const ids = textarea.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => element.querySelector(`#${id}`))).toBe(true);
    expect(counter.getAttribute('aria-live')).toBeNull();

    await type('a'.repeat(280));
    expect(counter.textContent).toContain('280 / 300');
    expect(counter.textContent).toContain('quedan 20');
    expect(counter.classList).toContain('level-warn');
    await type('a'.repeat(300));
    expect(counter.textContent).toContain('límite alcanzado');
  });

  it('asks for a prompt on Generate and focuses the editor instead of calling the API', async () => {
    const { element, textarea, press } = await render(me([]));
    await press();
    expect(generate).not.toHaveBeenCalled();
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Escribe un prompt para generar.',
    );
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(textarea);
  });

  it('generates the prompt and keeps it in the editor', async () => {
    const { textarea, type, press } = await render(me([]));
    await type('una chiva bajo la lluvia');
    await press();
    expect(generate).toHaveBeenCalledWith('una chiva bajo la lluvia');
    expect(textarea.value).toBe('una chiva bajo la lluvia');
  });

  it('blocks an identical prompt with a visible reason (same seed, same image)', async () => {
    const { element, textarea, type, press } = await render(
      me([attempt('a1', 'una taza de café')]),
    );
    await type('  una taza   de café ');
    expect(element.querySelector('.notice')?.textContent).toContain(
      'Es el mismo prompt del intento 1',
    );
    expect(textarea.getAttribute('aria-describedby')).toContain('notice');
    await press();
    expect(generate).not.toHaveBeenCalled();
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Ya generaste este mismo prompt',
    );
    expect(document.activeElement).toBe(textarea);

    await type('una taza de café con leche');
    expect(element.querySelector('.notice')).toBeNull();
    expect(element.querySelector('.field-error')).toBeNull();
  });

  it('makes Generate unavailable (aria-disabled, with the reason) while a generation is in flight', async () => {
    generation.set({ attemptId: 'a2', status: 'QUEUED', queuePosition: 4 });
    const { element, generateButton, type, press } = await render(me([]));
    expect(generateButton.getAttribute('aria-disabled')).toBe('true');
    const reasonId = generateButton.getAttribute('aria-describedby')!;
    expect(element.querySelector(`#${reasonId}`)?.textContent).toContain(
      'Espera a que termine tu imagen',
    );
    expect(element.querySelector('pb-generation-status')?.textContent).toContain(
      'En cola · posición 4',
    );
    await type('otra idea');
    await press();
    expect(generate).not.toHaveBeenCalled();
  });

  it('locks the editor when no attempts are left and says what to do next', async () => {
    const { element, textarea, generateButton } = await render(
      me([attempt('a1', 'uno'), attempt('a2', 'dos'), attempt('a3', 'tres')], 0),
    );
    expect(textarea.readOnly).toBe(true);
    expect(generateButton.getAttribute('aria-disabled')).toBe('true');
    expect(element.textContent).toContain('Ya usaste tus 3 intentos');
  });

  it('shows a blocked prompt on the field, and other request errors as a message', async () => {
    generate.mockResolvedValueOnce(new ApiError(422, 'PROMPT_BLOCKED'));
    const { element, textarea, type, press } = await render(me([]));
    await type('algo prohibido');
    await press();
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Ese prompt no está permitido en este evento. Intenta con otra idea.',
    );
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(announce).toHaveBeenCalled();

    generate.mockResolvedValueOnce(new ApiError(429, 'RATE_LIMITED', { retryAfterSec: 12 }));
    await type('otra cosa');
    await press();
    expect(element.querySelector('form pb-inline-message')?.textContent).toContain('Espera 12 s');
    expect(textarea.getAttribute('aria-invalid')).toBe('false');
  });

  it('restores this round’s draft after a reload', async () => {
    sessionStorage.setItem(
      draftStorageKey('mde'),
      JSON.stringify({ roundId: 'r1', prompt: 'mi idea a medias' }),
    );
    const { textarea, type } = await render(me([]));
    expect(textarea.value).toBe('mi idea a medias');
    await type('mi idea completa');
    expect(JSON.parse(sessionStorage.getItem(draftStorageKey('mde'))!)).toEqual({
      roundId: 'r1',
      prompt: 'mi idea completa',
    });
  });

  it('ignores a draft from another round', async () => {
    sessionStorage.setItem(
      draftStorageKey('mde'),
      JSON.stringify({ roundId: 'older', prompt: 'vieja idea' }),
    );
    const { textarea } = await render(me([]));
    expect(textarea.value).toBe('');
  });
});
