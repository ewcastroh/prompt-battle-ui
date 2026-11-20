import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CityService } from '../../core/city/city.service';
import { AppHeader } from '../../shared/app-header/app-header';
import { ShellStatus } from '../shell/shell-status';

/** `/stage/:city`: projector shell. Screens arrive in U3. */
@Component({
  selector: 'pb-stage-shell',
  imports: [AppHeader, ShellStatus, TranslocoPipe],
  template: `
    <pb-app-header variant="stage" [title]="'stage.title' | transloco" [cityName]="cityName()" />
    <main class="stage">
      <p class="stage-city">{{ cityName() }}</p>
      <h2 class="stage-title">{{ 'app.eventTitle' | transloco }}</h2>
      <p class="stage-note">{{ 'stage.placeholder' | transloco }}</p>
      <pb-shell-status />
    </main>
  `,
  styleUrls: ['../shell/screen-shell.css', './stage-shell.css'],
})
export class StageShell {
  private readonly cities = inject(CityService);
  readonly city = input.required<string>();
  protected readonly cityName = computed(() => this.cities.find(this.city())?.name ?? null);
}
