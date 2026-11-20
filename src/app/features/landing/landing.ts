import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CityService } from '../../core/city/city.service';
import { errorMessage } from '../../core/api/error-messages';
import { AppHeader } from '../../shared/app-header/app-header';
import { Icon } from '../../shared/icon/icon';
import { ShellStatus } from '../shell/shell-status';

/** `/`: short landing page listing the cities (for testing; players arrive by QR). */
@Component({
  selector: 'pb-landing',
  imports: [AppHeader, Icon, RouterLink, ShellStatus, TranslocoPipe],
  template: `
    <pb-app-header [title]="'app.eventTitle' | transloco" />
    <main>
      <section class="window" aria-labelledby="cities-heading">
        <p class="window-bar">~/cities</p>
        <div class="window-body">
          <h2 id="cities-heading">{{ 'landing.heading' | transloco }}</h2>
          <p>{{ 'landing.intro' | transloco }}</p>
          @if (cities.value(); as list) {
            <ul class="cities">
              @for (city of list; track city.code) {
                <li class="city">
                  <p class="city-name"><pb-icon name="map-pin" />{{ city.name }}</p>
                  <nav class="links" [attr.aria-label]="city.name">
                    <a [routerLink]="['/play', city.code]">{{ 'landing.play' | transloco }}</a>
                    <a [routerLink]="['/stage', city.code]">{{ 'landing.stage' | transloco }}</a>
                    <a [routerLink]="['/admin', city.code]">{{ 'landing.admin' | transloco }}</a>
                  </nav>
                </li>
              }
            </ul>
          } @else if (cities.error(); as error) {
            <p class="error" role="alert">
              <pb-icon name="circle-alert" />{{ message(error).key | transloco }}
            </p>
          } @else {
            <p aria-live="polite">{{ 'landing.loading' | transloco }}</p>
          }
        </div>
        <pb-shell-status />
      </section>
    </main>
  `,
  styleUrls: ['../shell/screen-shell.css', './landing.css'],
})
export class Landing {
  private readonly cityService = inject(CityService);
  protected readonly cities = resource({ loader: () => this.cityService.load() });
  protected readonly message = errorMessage;
}
