import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  LANGUAGES,
  Language,
  LOCALE_TAGS,
  LanguageService,
} from '../../core/i18n/language.service';
import { ThemeService } from '../../core/theme/theme.service';
import { Icon } from '../icon/icon';

let nextId = 0;

/**
 * Settings popover in the header (DESIGN.md §7): language (ES / EN) and the two-state theme toggle.
 *
 * Uses the Popover API with `popovertarget` (top layer, light dismiss, Escape, implicit anchor and
 * `aria-expanded` handled by the browser). Where the Popover API is missing, the panel falls back to a
 * plain disclosure toggled by the same button. It is not an ARIA menu: it holds form controls.
 *
 * With `homeLink`, the panel ends with a plain link to `/` (the cities). Only the screens that have no
 * visible way home turn it on (the stage, the admin console); player screens leave it off.
 */
@Component({
  selector: 'pb-settings-menu',
  imports: [Icon, RouterLink, TranslocoPipe],
  templateUrl: './settings-menu.html',
  styleUrl: './settings-menu.css',
})
export class SettingsMenu {
  /** Adds a "See the cities" link (to `/`) at the end of the panel. */
  readonly homeLink = input(false);

  private readonly languageService = inject(LanguageService);
  protected readonly theme = inject(ThemeService);

  protected readonly uid = `pb-settings-${nextId++}`;
  protected readonly panelId = `${this.uid}-panel`;
  protected readonly languages = LANGUAGES;
  protected readonly localeTags = LOCALE_TAGS;
  protected readonly language = this.languageService.language;

  /** True when the browser lacks the Popover API. */
  protected readonly fallback = !Object.hasOwn(HTMLElement.prototype, 'popover');
  protected readonly fallbackOpen = signal(false);
  protected readonly panelHidden = computed(() => this.fallback && !this.fallbackOpen());

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected setLanguage(language: Language): void {
    this.languageService.setLanguage(language);
  }

  protected onTriggerClick(): void {
    if (this.fallback) {
      this.fallbackOpen.update((open) => !open);
    }
  }

  protected onPanelKeydown(event: KeyboardEvent): void {
    if (this.fallback && event.key === 'Escape' && this.fallbackOpen()) {
      this.fallbackOpen.set(false);
      this.trigger().nativeElement.focus();
    }
  }
}
