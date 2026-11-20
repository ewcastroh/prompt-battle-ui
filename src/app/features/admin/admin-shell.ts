import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CityService } from '../../core/city/city.service';
import { AppHeader } from '../../shared/app-header/app-header';
import { ShellStatus } from '../shell/shell-status';

/** `/admin/:city`: admin console shell. Token login and screens arrive in U3. */
@Component({
  selector: 'pb-admin-shell',
  imports: [AppHeader, ShellStatus, TranslocoPipe],
  template: `
    <pb-app-header [title]="'admin.title' | transloco" [cityName]="cityName()" />
    <main>
      <section class="window" aria-labelledby="admin-heading">
        <p class="window-bar">~/{{ city() }}/admin</p>
        <div class="window-body">
          <h2 id="admin-heading">{{ 'admin.heading' | transloco }}</h2>
          <p>{{ 'admin.placeholder' | transloco }}</p>
        </div>
        <pb-shell-status />
      </section>
    </main>
  `,
  styleUrl: '../shell/screen-shell.css',
})
export class AdminShell {
  private readonly cities = inject(CityService);
  readonly city = input.required<string>();
  protected readonly cityName = computed(() => this.cities.find(this.city())?.name ?? null);
}
