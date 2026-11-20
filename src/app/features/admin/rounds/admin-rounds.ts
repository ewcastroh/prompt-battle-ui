import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApiError } from '../../../core/api/api-error';
import { ApiUrlPipe } from '../../../core/api/api-url.pipe';
import { RoundDefinition } from '../../../core/api/api.models';
import { ErrorMessage, errorMessage } from '../../../core/api/error-messages';
import { formatCountdown } from '../../../core/time/server-clock';
import { Announcer } from '../../../core/ui/announcer';
import { Icon } from '../../../shared/icon/icon';
import { InlineMessage } from '../../../shared/inline-message/inline-message';
import { AdminApi } from '../admin-api';
import { AdminRoundsService, canStart } from '../admin-rounds.service';
import { AdminStateService } from '../admin-state.service';
import { ConfirmDialog } from '../confirm-dialog';
import { RoundForm } from './round-form';

/**
 * Shared round definitions (SPEC §3.2, §10.6): either admin creates, edits and deletes them until
 * any city starts one (then it is locked); each admin starts them in their own city. Calibration
 * status per round, with a retry after a failure; each city's run status.
 */
@Component({
  selector: 'pb-admin-rounds',
  imports: [ApiUrlPipe, ConfirmDialog, Icon, InlineMessage, RoundForm, TranslocoPipe],
  template: `
    <div class="section-head">
      <h2>{{ 'admin.rounds.title' | transloco }}</h2>
      <button type="button" class="btn btn-primary" (click)="form().openNew()">
        <pb-icon name="plus" />
        {{ 'admin.rounds.new' | transloco }}
      </button>
    </div>
    <p class="admin-hint">{{ 'admin.rounds.shared' | transloco }}</p>

    @if (error(); as message) {
      <pb-inline-message
        tone="danger"
        [dismissLabel]="'admin.dismiss' | transloco"
        (dismissed)="error.set(null)"
      >
        {{ message.key | transloco: message.params }}
      </pb-inline-message>
    }

    <div class="table-region" tabindex="0" role="region" aria-labelledby="admin-rounds-caption">
      <table class="admin-table">
        <caption id="admin-rounds-caption" class="visually-hidden">
          {{
            'admin.rounds.title' | transloco
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col" class="num">#</th>
            <th scope="col">{{ 'admin.rounds.target' | transloco }}</th>
            <th scope="col">{{ 'admin.rounds.name' | transloco }}</th>
            <th scope="col">{{ 'admin.rounds.settings' | transloco }}</th>
            <th scope="col">{{ 'admin.rounds.calibration' | transloco }}</th>
            <th scope="col">{{ 'admin.rounds.runs' | transloco }}</th>
            <th scope="col">{{ 'admin.actions' | transloco }}</th>
          </tr>
        </thead>
        <tbody>
          @for (round of rounds.rounds() ?? []; track round.id) {
            <tr>
              <td class="num">{{ round.position }}</td>
              <td>
                <img
                  class="thumb"
                  [src]="round.targetThumbUrl | apiUrl"
                  [alt]="'admin.rounds.targetAlt' | transloco: { name: round.name }"
                  width="64"
                  height="64"
                  loading="lazy"
                  decoding="async"
                />
              </td>
              <th scope="row" class="user-text name">
                {{ round.name }}
                @if (round.locked) {
                  <span class="badge neutral">{{ 'admin.rounds.locked' | transloco }}</span>
                }
              </th>
              <td>
                <div class="settings">
                  <span class="badge neutral">{{
                    (round.scored ? 'admin.rounds.scored' : 'admin.rounds.practice') | transloco
                  }}</span>
                  <span class="mono">{{ duration(round.durationSec) }}</span>
                  <span>{{
                    'admin.rounds.attempts' | transloco: { count: round.attemptsPerPlayer }
                  }}</span>
                </div>
              </td>
              <td>
                <span class="badge" [class]="'badge cal-' + round.calibration.status">
                  {{ 'admin.calibration.' + round.calibration.status | transloco }}
                </span>
              </td>
              <td>
                <ul class="runs">
                  @for (run of round.runs; track run.city) {
                    <li [class.own]="run.city === rounds.city()">
                      <span class="mono">{{ run.city }}</span>
                      {{ 'admin.runStatus.' + run.status | transloco }}
                    </li>
                  }
                </ul>
              </td>
              <td class="actions">
                @if (startable(round)) {
                  <button
                    type="button"
                    class="btn btn-small btn-primary"
                    [attr.aria-disabled]="live.busy() ? 'true' : null"
                    (click)="start(round)"
                  >
                    <pb-icon name="play" />
                    {{ 'admin.rounds.start' | transloco }}
                    <span class="visually-hidden">{{ round.name }}</span>
                  </button>
                }
                @if (!round.locked) {
                  <button type="button" class="btn btn-small" (click)="form().openEdit(round)">
                    <pb-icon name="pencil" />
                    {{ 'admin.rounds.edit' | transloco }}
                    <span class="visually-hidden">{{ round.name }}</span>
                  </button>
                  @if (round.calibration.status === 'FAILED') {
                    <button type="button" class="btn btn-small" (click)="calibrate(round)">
                      <pb-icon name="rotate-ccw" />
                      {{ 'admin.rounds.calibrate' | transloco }}
                      <span class="visually-hidden">{{ round.name }}</span>
                    </button>
                  }
                  <button type="button" class="btn btn-small" (click)="confirmDelete(round)">
                    <pb-icon name="trash-2" />
                    {{ 'admin.rounds.delete' | transloco }}
                    <span class="visually-hidden">{{ round.name }}</span>
                  </button>
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="7" class="admin-hint">
                {{ (rounds.rounds() ? 'admin.rounds.empty' : 'admin.loading') | transloco }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <pb-round-form (saved)="rounds.reload()" />

    <pb-confirm-dialog
      #deleteDialog
      [heading]="'admin.rounds.deleteTitle' | transloco: { name: deleting()?.name ?? '' }"
      [confirmLabel]="'admin.rounds.delete' | transloco"
      [action]="deleteAction"
    >
      <p>{{ 'admin.rounds.deleteBody' | transloco }}</p>
    </pb-confirm-dialog>
  `,
  styles: `
    @layer components {
      .name {
        min-inline-size: 10rem;
        font-weight: 700;
      }

      .name .badge {
        margin-inline-start: var(--space-1);
      }

      .settings {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-1) var(--space-2);
        min-inline-size: 9rem;
      }

      .runs {
        margin: 0;
        padding: 0;
        list-style: none;
        white-space: nowrap;
      }

      .runs .own {
        font-weight: 700;
      }

      .cal-READY {
        color: var(--color-success);
      }

      .cal-PENDING {
        color: var(--color-warning);
      }

      .cal-FAILED {
        color: var(--color-danger);
      }

      .cal-NOT_REQUIRED {
        color: var(--color-text-muted);
      }
    }
  `,
})
export class AdminRounds {
  private readonly api = inject(AdminApi);
  private readonly announcer = inject(Announcer);
  private readonly transloco = inject(TranslocoService);
  protected readonly rounds = inject(AdminRoundsService);
  protected readonly live = inject(AdminStateService);
  protected readonly form = viewChild.required(RoundForm);
  private readonly deleteDialog = viewChild.required<ConfirmDialog>('deleteDialog');

  protected readonly error = signal<ErrorMessage | null>(null);
  protected readonly deleting = signal<RoundDefinition | null>(null);
  private readonly phase = computed(() => this.live.state()?.phase);

  protected readonly deleteAction = async (): Promise<ApiError | null> => {
    const round = this.deleting();
    if (!round) {
      return null;
    }
    try {
      await this.api.deleteRound(round.id);
      this.rounds.reload();
      return null;
    } catch (error) {
      return error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN');
    }
  };

  protected duration(seconds: number): string {
    return formatCountdown(seconds);
  }

  protected startable(round: RoundDefinition): boolean {
    return canStart(round, this.rounds.city(), this.phase());
  }

  protected async start(round: RoundDefinition): Promise<void> {
    this.error.set(null);
    this.show(await this.live.act({ kind: 'start', roundId: round.id }));
  }

  protected async calibrate(round: RoundDefinition): Promise<void> {
    this.error.set(null);
    try {
      await this.api.calibrate(round.id);
      this.rounds.reload();
    } catch (error) {
      this.show(error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN'));
    }
  }

  protected confirmDelete(round: RoundDefinition): void {
    this.deleting.set(round);
    this.deleteDialog().open();
  }

  private show(error: ApiError | null): void {
    if (error) {
      const message = errorMessage(error);
      this.error.set(message);
      this.announcer.announce(this.transloco.translate(message.key, message.params));
    }
  }
}
