import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorKey } from '../../core/api/error-messages';
import { AppHeader } from '../../shared/app-header/app-header';
import { Icon } from '../../shared/icon/icon';

/**
 * Friendly error page. Reached from the city guard (`?code=CITY_NOT_FOUND&city=…`, URL kept) and from
 * unknown paths (`NOT_FOUND`).
 */
@Component({
  selector: 'pb-error-page',
  imports: [AppHeader, Icon, RouterLink, TranslocoPipe],
  template: `
    <pb-app-header [title]="'errorPage.title' | transloco" />
    <main>
      <section class="window" aria-labelledby="error-heading">
        <p class="window-bar">
          <pb-icon name="circle-alert" />
          <span>{{ resolvedCode() }}</span>
        </p>
        <div class="window-body">
          <h2 id="error-heading">{{ key() | transloco: { city: city() ?? '' } }}</h2>
          <p>
            <a routerLink="/">{{ 'errorPage.backHome' | transloco }}</a>
          </p>
        </div>
      </section>
    </main>
  `,
  styleUrl: '../shell/screen-shell.css',
})
export class ErrorPage {
  /** Query param `code` (guard) or route data `code` (wildcard route). */
  readonly code = input<string | null>(null);
  readonly city = input<string | null>(null);

  protected readonly resolvedCode = computed(() => this.code() ?? 'NOT_FOUND');
  protected readonly key = computed(() => errorKey(this.resolvedCode()));
}
