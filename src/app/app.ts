import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LiveAnnouncer } from './core/ui/announcer';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'pb-root',
  imports: [RouterOutlet, LiveAnnouncer],
  template: `<router-outlet /><pb-live-announcer />`,
})
export class App {
  // Created eagerly so the storage and matchMedia listeners run on every screen.
  protected readonly theme = inject(ThemeService);
}
