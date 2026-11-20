import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CityService } from '../../core/city/city.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AppHeader } from '../../shared/app-header/app-header';
import { Icon } from '../../shared/icon/icon';
import { InlineMessage } from '../../shared/inline-message/inline-message';
import { Spinner } from '../../shared/spinner/spinner';
import { AdminApi } from './admin-api';
import { AdminRoundsService } from './admin-rounds.service';
import { AdminSessionService } from './admin-session.service';
import { AdminStateService } from './admin-state.service';
import { AdminAlerts } from './alerts/admin-alerts';
import { AdminControl } from './control/admin-control';
import { AdminEntries } from './entries/admin-entries';
import { AdminEvent } from './event/admin-event';
import { AdminLogin } from './login/admin-login';
import { AdminPlayers } from './players/admin-players';
import { AdminProviders } from './providers/admin-providers';
import { AdminRounds } from './rounds/admin-rounds';

/** Section ids, in page order, for the sticky section bar (one page + section nav, U3 choice). */
export const ADMIN_SECTIONS = [
  'control',
  'rounds',
  'players',
  'entries',
  'providers',
  'alerts',
  'event',
] as const;

/**
 * `/admin/:city`: the admin console (SPEC §10.6), for a laptop or a phone. It asks for the city's
 * admin token, checks it belongs to the route's city, then shows one page: live controls first, a
 * sticky bar of section links, and on wide screens a side column for the shared panels (providers,
 * alerts, event). Each panel loads its own data; the live state polls every 2 s.
 */
@Component({
  selector: 'pb-admin-shell',
  imports: [
    AdminAlerts,
    AdminControl,
    AdminEntries,
    AdminEvent,
    AdminLogin,
    AdminPlayers,
    AdminProviders,
    AdminRounds,
    AppHeader,
    Icon,
    InlineMessage,
    Spinner,
    TranslocoPipe,
  ],
  providers: [AdminSessionService, AdminApi, AdminStateService, AdminRoundsService],
  templateUrl: './admin-shell.html',
  styleUrl: './admin-shell.css',
})
export class AdminShell {
  private readonly cities = inject(CityService);
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  protected readonly session = inject(AdminSessionService);
  protected readonly live = inject(AdminStateService);

  readonly city = input.required<string>();

  protected readonly sections = ADMIN_SECTIONS;
  protected readonly cityName = computed(() => this.cities.find(this.city())?.name ?? this.city());
  protected readonly retrying = computed(() => {
    const session = this.session.session();
    return session.kind === 'checking' && session.retrying;
  });
  protected readonly heading = computed(() => {
    this.language.language();
    this.language.translationsLoaded();
    return this.transloco.translate('admin.heading', { city: this.cityName() });
  });

  constructor() {
    effect(() => {
      const city = this.city();
      untracked(() => void this.session.start(city));
    });
    effect(() => {
      const ready = this.session.ready();
      untracked(() => (ready ? this.live.start() : this.live.stop()));
    });
    effect(() => {
      this.title.setTitle(`${this.heading()} | ${this.transloco.translate('app.name')}`);
    });
  }

  protected logout(): void {
    this.session.logout();
  }
}
