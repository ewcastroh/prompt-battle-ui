import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LanguageService } from '../../core/i18n/language.service';
import { translocoTesting } from '../../../testing/transloco-testing';
import { SettingsMenu } from './settings-menu';

describe('SettingsMenu', () => {
  beforeEach(async () => {
    localStorage.clear();
    window.matchMedia ??= (() => null) as unknown as typeof window.matchMedia;
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [provideRouter([])],
    });
    await TestBed.inject(LanguageService).init();
  });

  afterEach(() => localStorage.clear());

  async function render(homeLink?: boolean) {
    const fixture = TestBed.createComponent(SettingsMenu);
    if (homeLink !== undefined) {
      fixture.componentRef.setInput('homeLink', homeLink);
    }
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

  it('has no link to the cities by default (player screens)', async () => {
    const element = await render();
    expect(element.querySelector('[popover] a')).toBeNull();
  });

  it('with homeLink, ends the panel with a link to the cities page', async () => {
    const element = await render(true);
    const link = element.querySelector<HTMLAnchorElement>('[popover] a')!;
    expect(link.getAttribute('href')).toBe('/');
    expect(link.textContent).toContain('Ver las ciudades');
    expect(link.querySelector('pb-icon')).not.toBeNull();
    expect(element.querySelector('[popover]')!.lastElementChild!.contains(link)).toBe(true);
  });
});
