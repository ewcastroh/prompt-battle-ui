import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CityService } from '../../core/city/city.service';
import { AppHeader } from '../../shared/app-header/app-header';
import { ShellStatus } from '../shell/shell-status';

/** `/play/:city`: player screen shell. Screens arrive in U2. */
@Component({
  selector: 'pb-player-shell',
  imports: [AppHeader, ShellStatus, TranslocoPipe],
  template: `
    <pb-app-header [title]="'player.title' | transloco" [cityName]="cityName()" />
    <main>
      <section class="window" aria-labelledby="player-heading">
        <p class="window-bar">~/{{ city() }}/play</p>
        <div class="window-body">
          <h2 id="player-heading">{{ 'player.heading' | transloco }}</h2>
          <p>{{ 'player.placeholder' | transloco }}</p>
        </div>
        <pb-shell-status />
      </section>
    </main>
  `,
  styleUrl: '../shell/screen-shell.css',
})
export class PlayerShell {
  private readonly cities = inject(CityService);
  /** Route param, bound with `withComponentInputBinding()`. */
  readonly city = input.required<string>();
  protected readonly cityName = computed(() => this.cities.find(this.city())?.name ?? null);
}
