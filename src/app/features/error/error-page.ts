import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorKey } from '../../core/api/error-messages';
import { AppHeader } from '../../shared/app-header/app-header';
import { Icon } from '../../shared/icon/icon';

/**
 * Friendly error page. Reached from the city guard (`?code=CITY_NOT_FOUND&city=…`, URL kept) and from
 * unknown paths (`NOT_FOUND`). When the guard couldn't reach the API (venue Wi-Fi blip, API restart),
 * "Try again" reloads the original URL, which the guard kept in the address bar.
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
          @if (retryable()) {
            <p>
              <button type="button" class="btn btn-primary" (click)="retry()">
                {{ 'errorPage.retry' | transloco }}
              </button>
            </p>
          }
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
  protected readonly retryable = computed(
    () => !['CITY_NOT_FOUND', 'NOT_FOUND'].includes(this.resolvedCode()),
  );

  private readonly document = inject(DOCUMENT);

  protected retry(): void {
    this.document.location.reload();
  }
}
