import { Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';

/** Editor-style status line with the active language and theme (U1 shells only). */
@Component({
  selector: 'pb-shell-status',
  imports: [TranslocoPipe],
  template: `
    <span>{{ 'shell.statusLanguage' | transloco: { lang: localeTag() } }}</span>
    <span>{{ 'shell.statusTheme.' + themeKey() | transloco }}</span>
  `,
  host: { class: 'status' },
})
export class ShellStatus {
  private readonly languageService = inject(LanguageService);
  private readonly theme = inject(ThemeService);

  protected readonly localeTag = computed(() => {
    this.languageService.language();
    return this.languageService.localeTag();
  });
  protected readonly themeKey = computed(
    () => `${this.theme.rendered()}${this.theme.override() ? 'Override' : 'System'}`,
  );
}
