import { Component, booleanAttribute, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { SettingsMenu } from '../settings-menu/settings-menu';

export type HeaderVariant = 'default' | 'stage';

let nextId = 0;

/**
 * Screen header (DESIGN.md §7): city name, screen title and the settings button.
 * Compact on phones; on the stage it collapses to a low-emphasis corner control, because the stage
 * screens render their own large titles.
 *
 * The title is the page's only `<h1>`. It has `tabindex="-1"` so a screen can move focus to it after
 * the content under it is replaced (it is not in the tab order).
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
        <h1 class="title" tabindex="-1" [id]="titleId()">{{ title() }}</h1>
      </div>
      <pb-settings-menu [homeLink]="homeLink()" />
    </header>
  `,
  styleUrl: './app-header.css',
})
export class AppHeader {
  /** Already-translated screen title; becomes the page's `<h1>`. */
  readonly title = input.required<string>();
  readonly cityName = input<string | null>(null);
  readonly variant = input<HeaderVariant>('default');
  /** Adds a "See the cities" link to the settings popover (stage and admin; players have no use for it). */
  readonly homeLink = input(false, { transform: booleanAttribute });
  /** Id of the `<h1>`, for focus routing and `aria-labelledby`. */
  readonly titleId = input(`pb-header-title-${nextId++}`);
}
