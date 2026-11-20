import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../core/i18n/language.service';
import { translocoTesting } from '../../../testing/transloco-testing';
import { SettingsMenu } from './settings-menu';

describe('SettingsMenu', () => {
  beforeEach(async () => {
    localStorage.clear();
    window.matchMedia ??= (() => null) as unknown as typeof window.matchMedia;
    TestBed.configureTestingModule({ imports: [translocoTesting()] });
    await TestBed.inject(LanguageService).init();
  });

  afterEach(() => localStorage.clear());

  async function render() {
    const fixture = TestBed.createComponent(SettingsMenu);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('opens a popover from a named button', async () => {
    const element = await render();
    const trigger = element.querySelector<HTMLButtonElement>('button.trigger')!;
    const panel = element.querySelector<HTMLElement>('[popover]')!;
    expect(trigger.textContent).toContain('Abrir ajustes');
    expect(trigger.getAttribute('popovertarget') ?? trigger.getAttribute('aria-controls')).toBe(
      panel.id,
    );
  });

  it('switches language from the ES / EN control and updates <html lang>', async () => {
    const element = await render();
    const radios = element.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios).toHaveLength(2);
    expect(radios[0].checked).toBe(true);

    radios[1].click();
    expect(TestBed.inject(LanguageService).language()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
  });

  it('renders both theme options with action text; CSS hides the inactive one', async () => {
    const element = await render();
    const toggle = element.querySelector<HTMLButtonElement>('button.theme-toggle')!;
    expect(toggle.querySelector('.theme-if-light')?.textContent).toContain('Cambiar a tema oscuro');
    expect(toggle.querySelector('.theme-if-dark')?.textContent).toContain('Cambiar a tema claro');
  });
});
