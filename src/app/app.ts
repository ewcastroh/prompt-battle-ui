import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'pb-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  // Created eagerly so the storage and matchMedia listeners run on every screen.
  protected readonly theme = inject(ThemeService);
}
