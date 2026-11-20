import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Alert } from '../../../core/api/api.models';
import { Poller } from '../../../core/api/poller';
import { CityService } from '../../../core/city/city.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { Announcer } from '../../../core/ui/announcer';
import { Icon } from '../../../shared/icon/icon';
import { AdminApi } from '../admin-api';
import { TimePipe } from '../admin-format';
import { AdminRoundsService } from '../admin-rounds.service';
import { AdminSessionService } from '../admin-session.service';

/** Alerts are how a provider switch or a failed scoring reaches the admins: every 5 s. */
const ALERTS_POLL_MS = 5000;
/** API.md §7: at most 100 alerts per response; the panel keeps as many. */
const MAX_ALERTS = 100;

/** Alerts that need the admin to act (shown with the danger tone). */
const URGENT = new Set([
  'SCORING_FAILED',
  'CALIBRATION_FAILED',
  'CIRCUIT_OPEN',
  'EMBEDDING_QUOTA_LOW',
]);

/** Merges newly fetched alerts (newest first) into the list, without duplicates, newest first. */
export function mergeAlerts(current: readonly Alert[], fetched: readonly Alert[]): Alert[] {
  const seen = new Set(current.map((alert) => alert.id));
  return [...fetched.filter((alert) => !seen.has(alert.id)), ...current]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_ALERTS);
}

/**
 * Alerts for both admins (SPEC §10.6, API.md §7 codes), newest first, translated from
 * `alerts.<CODE>` with their params. New alerts after the first load are announced politely.
 */
@Component({
  selector: 'pb-admin-alerts',
  imports: [Icon, TimePipe, TranslocoPipe],
  template: `
    <div class="section-head">
      <h2>{{ 'admin.alerts.title' | transloco }}</h2>
      <span class="badge neutral">{{ 'admin.shared' | transloco }}</span>
    </div>
    @if (alerts().length === 0) {
      <p class="admin-hint">{{ 'admin.alerts.empty' | transloco }}</p>
    } @else {
      <ol class="list">
        @for (alert of alerts(); track alert.id) {
          <li class="alert" [class.urgent]="urgent(alert)">
            <pb-icon [name]="urgent(alert) ? 'triangle-alert' : 'bell'" />
            <div class="body">
              <p class="text">{{ 'alerts.' + alert.code | transloco: params(alert) }}</p>
              <p class="meta mono">
                {{ alert.at | pbTime: locale() }} ·
                {{ alert.city ? cityLabel(alert.city) : ('admin.alerts.event' | transloco) }}
              </p>
            </div>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    @layer components {
      .list {
        display: grid;
        gap: var(--space-2);
        max-block-size: 28rem;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        list-style: none;
      }

      .alert {
        display: flex;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        border: var(--border-width) solid var(--color-border);
        border-inline-start: 0.375rem solid var(--color-info);
        border-radius: var(--radius-md);
      }

      .alert pb-icon {
        margin-block-start: 0.125rem;
        color: var(--color-info);
      }

      .alert.urgent {
        border-inline-start-color: var(--color-danger);
      }

      .alert.urgent pb-icon {
        color: var(--color-danger);
      }

      .body {
        min-inline-size: 0;
      }

      .text,
      .meta {
        margin: 0;
        overflow-wrap: anywhere;
      }

      .meta {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }
    }
  `,
})
export class AdminAlerts {
  private readonly api = inject(AdminApi);
  private readonly session = inject(AdminSessionService);
  private readonly cities = inject(CityService);
  private readonly rounds = inject(AdminRoundsService);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly announcer = inject(Announcer);

  protected readonly alerts = signal<Alert[]>([]);
  private loaded = false;

  protected readonly locale = computed(() => {
    this.language.language();
    return this.language.localeTag();
  });

  private readonly poller = new Poller({
    intervalMs: ALERTS_POLL_MS,
    run: async () => {
      if (!this.session.ready()) {
        return false;
      }
      const since = this.alerts()[0]?.at ?? null;
      const fetched = await this.api.alerts(since);
      if (fetched.length > 0) {
        this.alerts.update((current) => mergeAlerts(current, fetched));
        if (this.loaded) {
          const newest = fetched[0];
          this.announcer.announce(
            `${this.transloco.translate('admin.alerts.new')} ${this.transloco.translate(
              `alerts.${newest.code}`,
              this.params(newest),
            )}`,
          );
        }
      }
      this.loaded = true;
      return true;
    },
  });

  constructor() {
    effect(() => {
      const ready = this.session.ready();
      untracked(() => {
        if (ready) {
          this.poller.start();
        } else {
          this.poller.stop();
          this.alerts.set([]);
          this.loaded = false;
        }
      });
    });
    inject(DestroyRef).onDestroy(() => this.poller.stop());
  }

  protected urgent(alert: Alert): boolean {
    return URGENT.has(alert.code);
  }

  protected cityLabel(code: string): string {
    return this.cities.find(code)?.name ?? code;
  }

  /** Params as the API sends them, with names for `byCity` (a city) and `roundId` (as `round`). */
  protected params(alert: Alert): Record<string, unknown> {
    const params: Record<string, unknown> = { ...alert.params };
    if (typeof params['byCity'] === 'string') {
      params['byCity'] = this.cityLabel(params['byCity']);
    }
    if (typeof params['roundId'] === 'string') {
      const id = params['roundId'];
      params['round'] = this.rounds.rounds()?.find((round) => round.id === id)?.name ?? id;
    }
    return params;
  }
}
