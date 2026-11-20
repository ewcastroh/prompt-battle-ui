import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiError } from '../../../core/api/api-error';
import { ProbeResponse, Providers } from '../../../core/api/api.models';
import { ErrorMessage, errorMessage } from '../../../core/api/error-messages';
import { Poller } from '../../../core/api/poller';
import { LanguageService } from '../../../core/i18n/language.service';
import { Icon } from '../../../shared/icon/icon';
import { InlineMessage } from '../../../shared/inline-message/inline-message';
import { Spinner } from '../../../shared/spinner/spinner';
import { AdminApi } from '../admin-api';
import { NumberPipe, TimePipe } from '../admin-format';
import { AdminSessionService } from '../admin-session.service';
import { ConfirmDialog } from '../confirm-dialog';

/** Provider health changes fast during a round: every 5 s. */
const PROVIDERS_POLL_MS = 5000;

/**
 * Provider panel (SPEC §10.6, shared by both cities): active image provider, chain and load split,
 * queue length; per provider its circuit, slots in use, p50/p95 latency, successes, failures and
 * the last error; embedding providers (health, determinism); the commentary model. Forcing a
 * provider and running the probe (it spends real credits) are confirmed first.
 */
@Component({
  selector: 'pb-admin-providers',
  imports: [ConfirmDialog, Icon, InlineMessage, NumberPipe, Spinner, TimePipe, TranslocoPipe],
  template: `
    <div class="section-head">
      <h2>{{ 'admin.providers.title' | transloco }}</h2>
      <span class="badge neutral">{{ 'admin.shared' | transloco }}</span>
    </div>

    @if (error(); as message) {
      <pb-inline-message
        tone="danger"
        [dismissLabel]="'admin.dismiss' | transloco"
        (dismissed)="error.set(null)"
      >
        {{ message.key | transloco: message.params }}
      </pb-inline-message>
    }

    @if (providers(); as p) {
      <dl class="facts">
        <div>
          <dt>{{ 'admin.providers.active' | transloco }}</dt>
          <dd class="mono strong">{{ p.active }}</dd>
        </div>
        <div>
          <dt>{{ 'admin.providers.chain' | transloco }}</dt>
          <dd class="mono">{{ p.chain.join(' → ') || '—' }}</dd>
        </div>
        <div>
          <dt>{{ 'admin.providers.split' | transloco }}</dt>
          <dd class="mono">{{ p.loadSplit.join(', ') || '—' }}</dd>
        </div>
        <div>
          <dt>{{ 'admin.providers.queue' | transloco }}</dt>
          <dd class="mono">{{ p.queueLength }}</dd>
        </div>
      </dl>

      <div class="table-region" tabindex="0" role="region" aria-labelledby="admin-image-caption">
        <table class="admin-table">
          <caption id="admin-image-caption">
            {{
              'admin.providers.image' | transloco
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'admin.providers.provider' | transloco }}</th>
              <th scope="col">{{ 'admin.providers.circuit' | transloco }}</th>
              <th scope="col" class="num">{{ 'admin.providers.slots' | transloco }}</th>
              <th scope="col" class="num">p50 / p95</th>
              <th scope="col" class="num">{{ 'admin.providers.okFail' | transloco }}</th>
              <th scope="col">{{ 'admin.providers.lastError' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of p.image; track row.id) {
              <tr [class.muted]="!row.configured">
                <th scope="row">
                  <span class="mono">{{ row.id }}</span>
                  @if (row.id === p.active) {
                    <span class="badge ok"
                      ><pb-icon name="check" />{{ 'admin.providers.activeBadge' | transloco }}</span
                    >
                  }
                  <span class="model mono">{{ row.model }}</span>
                </th>
                <td>
                  @if (!row.configured) {
                    <span class="badge neutral">{{ 'admin.providers.noKey' | transloco }}</span>
                  } @else {
                    <span
                      class="badge"
                      [class.ok]="row.circuit === 'CLOSED'"
                      [class.danger]="row.circuit === 'OPEN'"
                      [class.warn]="row.circuit === 'HALF_OPEN'"
                      >{{ 'admin.circuit.' + row.circuit | transloco }}</span
                    >
                  }
                </td>
                <td class="num">{{ row.inFlight }} / {{ row.maxConcurrency }}</td>
                <td class="num">{{ ms(row.p50Ms) }} / {{ ms(row.p95Ms) }}</td>
                <td class="num">{{ row.successCount }} / {{ row.failureCount }}</td>
                <td>
                  @if (row.lastError; as last) {
                    <span>{{ 'admin.errorKind.' + last.kind | transloco }}</span>
                    <span class="model">{{ last.at | pbTime: locale() }}</span>
                  } @else {
                    —
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <ul class="plain">
        @for (row of p.embedding; track row.id) {
          <li>
            <strong>{{ 'admin.providers.embedding' | transloco }}:</strong>
            <span class="mono">{{ row.id }} · {{ row.model }}</span>
            <span class="badge" [class.ok]="row.healthy" [class.danger]="!row.healthy">{{
              (row.healthy ? 'admin.providers.healthy' : 'admin.providers.unhealthy') | transloco
            }}</span>
            @if ((row.determinism?.maxDiff ?? null) !== null) {
              @let d = row.determinism!;
              <span class="model"
                >{{ 'admin.providers.determinism' | transloco: { diff: d.maxDiff } }}
                @if (d.averaging) {
                  · {{ 'admin.providers.averaging' | transloco }}
                }
              </span>
            }
          </li>
        }
        <li>
          <strong>{{ 'admin.providers.commentary' | transloco }}:</strong>
          <span class="mono">{{ p.commentary.model }}</span>
          <span
            class="badge"
            [class.ok]="p.commentary.configured"
            [class.neutral]="!p.commentary.configured"
            >{{
              (p.commentary.configured ? 'admin.providers.live' : 'admin.providers.canned')
                | transloco
            }}</span
          >
        </li>
      </ul>

      <div class="force">
        <label class="field-label" for="force-provider">{{
          'admin.providers.force' | transloco
        }}</label>
        <div class="section-actions">
          <select
            id="force-provider"
            class="text-input"
            [value]="choice() ?? p.active"
            (change)="choice.set($any($event.target).value)"
          >
            @for (row of configured(); track row.id) {
              <option [value]="row.id">{{ row.id }}</option>
            }
          </select>
          <button type="button" class="btn" (click)="forceDialog.open()">
            {{ 'admin.providers.forceButton' | transloco }}
          </button>
        </div>
      </div>
    } @else {
      <p class="admin-hint">{{ 'admin.loading' | transloco }}</p>
    }

    <div class="section-actions">
      <button
        type="button"
        class="btn"
        [attr.aria-disabled]="probing() ? 'true' : null"
        (click)="probeDialog.open()"
      >
        <pb-icon name="activity" />
        {{ 'admin.providers.probe' | transloco }}
      </button>
    </div>
    @if (probing()) {
      <p class="busy">
        <pb-spinner labelledBy="admin-probing" />
        <span id="admin-probing">{{ 'admin.providers.probing' | transloco }}</span>
      </p>
    }
    @if (probe(); as result) {
      <div class="table-region" tabindex="0" role="region" aria-labelledby="admin-probe-caption">
        <table class="admin-table">
          <caption id="admin-probe-caption">
            {{
              'admin.providers.probeResult'
                | transloco: { at: (result.startedAt | pbTime: locale()) }
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'admin.providers.kind' | transloco }}</th>
              <th scope="col">{{ 'admin.providers.provider' | transloco }}</th>
              <th scope="col">{{ 'admin.providers.result' | transloco }}</th>
              <th scope="col" class="num">ms</th>
            </tr>
          </thead>
          <tbody>
            @for (row of result.results; track $index) {
              <tr>
                <td class="mono">{{ row.kind }}</td>
                <th scope="row" class="mono">{{ row.providerId }}</th>
                <td>
                  @if (row.ok) {
                    <span class="badge ok"
                      ><pb-icon name="check" />{{ 'admin.providers.ok' | transloco }}</span
                    >
                  } @else if (row.errorKind === 'NOT_CONFIGURED') {
                    <span class="badge neutral">{{
                      'admin.errorKind.NOT_CONFIGURED' | transloco
                    }}</span>
                  } @else {
                    <span class="badge danger"
                      ><pb-icon name="x" />{{
                        'admin.errorKind.' + (row.errorKind ?? 'PROVIDER_ERROR') | transloco
                      }}</span
                    >
                  }
                  @if (row.determinismMaxDiff !== null) {
                    <span class="model">Δ {{ row.determinismMaxDiff | pbNum: 6 : locale() }}</span>
                  }
                </td>
                <td class="num">{{ row.latencyMs ?? '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }

    <pb-confirm-dialog
      #forceDialog
      tone="primary"
      [heading]="'admin.providers.forceTitle' | transloco: { provider: choice() ?? '' }"
      [confirmLabel]="'admin.providers.forceButton' | transloco"
      [action]="forceAction"
    >
      <p>{{ 'admin.providers.forceBody' | transloco }}</p>
    </pb-confirm-dialog>
    <pb-confirm-dialog
      #probeDialog
      tone="primary"
      [heading]="'admin.providers.probeTitle' | transloco"
      [confirmLabel]="'admin.providers.probe' | transloco"
      [action]="probeAction"
    >
      <p>{{ 'admin.providers.probeBody' | transloco }}</p>
    </pb-confirm-dialog>
  `,
  styles: `
    @layer components {
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr));
        gap: var(--space-2) var(--space-4);
        margin: 0;
      }

      .facts dt {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }

      .facts dd {
        margin: 0;
      }

      .strong {
        font-weight: 700;
      }

      .model {
        display: block;
        font-size: var(--text-sm);
        font-weight: 400;
        color: var(--color-text-muted);
      }

      .plain {
        display: grid;
        gap: var(--space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .plain li {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-1) var(--space-2);
      }

      .force {
        display: grid;
        gap: var(--space-1);
      }

      .force select {
        inline-size: auto;
        min-block-size: var(--tap-target);
      }

      .busy {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin: 0;
        font-weight: 700;
      }

      .admin-table pb-icon {
        --icon-size: 1em;
      }
    }
  `,
})
export class AdminProviders {
  private readonly api = inject(AdminApi);
  private readonly session = inject(AdminSessionService);
  private readonly language = inject(LanguageService);

  protected readonly providers = signal<Providers | null>(null);
  protected readonly probe = signal<ProbeResponse | null>(null);
  protected readonly probing = signal(false);
  protected readonly error = signal<ErrorMessage | null>(null);
  protected readonly choice = signal<string | null>(null);

  protected readonly locale = computed(() => {
    this.language.language();
    return this.language.localeTag();
  });
  protected readonly configured = computed(
    () => this.providers()?.image.filter((row) => row.configured) ?? [],
  );

  private readonly poller = new Poller({
    intervalMs: PROVIDERS_POLL_MS,
    run: async () => {
      if (!this.session.ready()) {
        return false;
      }
      this.providers.set(await this.api.providers());
      return true;
    },
  });

  protected readonly forceAction = async (): Promise<ApiError | null> => {
    const id = this.choice() ?? this.providers()?.active;
    if (!id) {
      return null;
    }
    try {
      this.providers.set(await this.api.forceProvider(id));
      return null;
    } catch (error) {
      return error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN');
    }
  };

  /** The probe can take ~60 s: the dialog closes at once and the panel shows progress. */
  protected readonly probeAction = async (): Promise<ApiError | null> => {
    void this.runProbe();
    return null;
  };

  constructor() {
    effect(() => {
      const ready = this.session.ready();
      untracked(() => (ready ? this.poller.start() : this.poller.stop()));
    });
    inject(DestroyRef).onDestroy(() => this.poller.stop());
  }

  protected ms(value: number | null): string {
    return value === null ? '—' : String(value);
  }

  private async runProbe(): Promise<void> {
    if (this.probing()) {
      return;
    }
    this.probing.set(true);
    this.error.set(null);
    try {
      this.probe.set(await this.api.probe());
      this.poller.now();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.probing.set(false);
    }
  }
}
