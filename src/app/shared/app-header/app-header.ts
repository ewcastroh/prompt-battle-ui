import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SettingsMenu } from '../settings-menu/settings-menu';

export type HeaderVariant = 'default' | 'stage';

/**
 * Screen header (DESIGN.md §7): city name, screen title and the settings button.
 * Compact on phones; on the stage it collapses to a low-emphasis corner control, because the stage
 * screens render their own large titles.
 */
@Component({
  selector: 'pb-app-header',
  imports: [SettingsMenu, TranslocoPipe],
  host: { '[class.stage]': "variant() === 'stage'" },
  template: `
    <header class="bar">
      <div class="ident" [class.visually-hidden]="variant() === 'stage'">
        <p class="context">
          <span class="brand">{{ 'app.brand' | transloco }}</span>
          @if (cityName(); as city) {
            <span class="sep" aria-hidden="true">/</span>
            <span class="city">{{ city }}</span>
          }
        </p>
        <h1 class="title">{{ title() }}</h1>
      </div>
      <pb-settings-menu />
    </header>
  `,
  styleUrl: './app-header.css',
})
export class AppHeader {
  /** Already-translated screen title; becomes the page's `<h1>`. */
  readonly title = input.required<string>();
  readonly cityName = input<string | null>(null);
  readonly variant = input<HeaderVariant>('default');
}
