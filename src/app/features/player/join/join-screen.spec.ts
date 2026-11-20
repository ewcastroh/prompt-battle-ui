import { TestBed } from '@angular/core/testing';
import { ApiError } from '../../../core/api/api-error';
import { Announcer } from '../../../core/ui/announcer';
import { translocoTesting } from '../../../../testing/transloco-testing';
import { PlayerStateService } from '../player-state.service';
import { JoinScreen } from './join-screen';

describe('JoinScreen (SPEC §10.4, §6.1)', () => {
  let join: ReturnType<typeof vi.fn>;
  let announce: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    join = vi.fn().mockResolvedValue(null);
    announce = vi.fn();
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        { provide: PlayerStateService, useValue: { join } },
        { provide: Announcer, useValue: { announce } },
      ],
    });
  });

  async function render(reason: 'UNAUTHORIZED' | 'PLAYER_KICKED' | null = null) {
    const fixture = TestBed.createComponent(JoinScreen);
    fixture.componentRef.setInput('cityCode', 'mde');
    fixture.componentRef.setInput('cityName', 'Medellín');
    fixture.componentRef.setInput('reason', reason);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('input#join-nickname')!;
    const type = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const submit = async () => {
      element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      await fixture.whenStable();
    };
    return { fixture, element, input, type, submit };
  }

  it('has the SPEC title area, the privacy notice and a labelled field with the rule above it', async () => {
    const { element, input } = await render();
    expect(element.textContent).toContain('Entra al juego en Medellín');
    expect(element.textContent).toContain(
      'Usa un alias. No escribas datos personales. Tus prompts se envían a servicios de IA de terceros para generar y evaluar imágenes.',
    );
    expect(element.querySelector('label[for="join-nickname"]')?.textContent).toContain('Tu alias');
    expect(input.getAttribute('aria-describedby')).toBe('join-nickname-hint join-privacy');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.getAttribute('autocomplete')).toBe('nickname');
    expect(input.required).toBe(true);
    expect(input.maxLength).toBe(16);
    expect(element.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Entrar');
  });

  it('shows the error only after a submit, focuses the field and does not call the API', async () => {
    const { element, input, submit } = await render();
    expect(element.querySelector('.field-error')).toBeNull();
    await submit();
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Escribe un alias para entrar.',
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('join-nickname-error');
    expect(document.activeElement).toBe(input);
    expect(join).not.toHaveBeenCalled();
  });

  it('explains the nickname rule when the value breaks it, and clears once fixed', async () => {
    const { element, input, type, submit } = await render();
    await type('a!');
    await submit();
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Tu alias debe tener entre 3 y 16 caracteres',
    );
    await type('Ana_dev');
    expect(element.querySelector('.field-error')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('joins with the trimmed nickname', async () => {
    const { type, submit } = await render();
    await type('  Ana_dev  ');
    await submit();
    expect(join).toHaveBeenCalledWith('Ana_dev');
  });

  it('shows a taken nickname on the field and focuses it', async () => {
    join.mockResolvedValue(new ApiError(409, 'NICKNAME_TAKEN'));
    const { element, input, type, submit } = await render();
    await type('Ana_dev');
    await submit();
    expect(element.querySelector('.field-error')?.textContent).toContain(
      'Ese alias ya está en uso',
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input);
    await type('Ana_dev2');
    expect(element.querySelector('.field-error')).toBeNull();
  });

  it('shows and announces a network error without marking the field invalid', async () => {
    join.mockResolvedValue(new ApiError(0, 'NETWORK_ERROR'));
    const { element, input, type, submit } = await render();
    await type('Ana_dev');
    await submit();
    expect(element.querySelector('pb-inline-message')?.textContent).toContain('No hay conexión');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('No hay conexión'));
  });

  it('explains why the player is back after a kick', async () => {
    const { element } = await render('PLAYER_KICKED');
    const notice = element.querySelector('pb-inline-message')!;
    expect(notice.textContent).toContain('Un administrador te retiró del juego.');
    expect(notice.textContent).toContain('puedes volver a entrar con otro alias');
  });
});
