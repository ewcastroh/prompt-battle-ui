import {
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiUrlPipe } from '../../../core/api/api-url.pipe';
import { AdminEntry } from '../../../core/api/api.models';
import { ErrorMessage, errorMessage } from '../../../core/api/error-messages';
import { LanguageService } from '../../../core/i18n/language.service';
import { Icon } from '../../../shared/icon/icon';
import { ImageDialog } from '../../../shared/image-dialog/image-dialog';
import { InlineMessage } from '../../../shared/inline-message/inline-message';
import { AdminApi } from '../admin-api';
import { NumberPipe } from '../admin-format';
import { AdminRoundsService, ownRun } from '../admin-rounds.service';
import { AdminStateService } from '../admin-state.service';

/**
 * Entries of one round in the own city (SPEC §10.6): thumbnail (opens full size with the prompt),
 * player, prompt, image provider and model, embedding provider, cos, floor, score, automatic and
 * hidden flags; hide or show again. A hidden entry never reaches the stage (SPEC §6.2).
 */
@Component({
  selector: 'pb-admin-entries',
  imports: [ApiUrlPipe, Icon, ImageDialog, InlineMessage, NumberPipe, TranslocoPipe],
  template: `
    <div class="section-head">
      <h2>{{ 'admin.entries.title' | transloco }}</h2>
      @if (playedRounds().length > 0) {
        <div class="picker">
          <label class="field-label" for="entries-round">{{
            'admin.entries.round' | transloco
          }}</label>
          <select
            id="entries-round"
            class="text-input"
            [value]="roundId() ?? ''"
            (change)="roundId.set($any($event.target).value)"
          >
            @for (round of playedRounds(); track round.id) {
              <option [value]="round.id">{{ round.name }}</option>
            }
          </select>
        </div>
      }
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

    @if (roundId()) {
      <div class="table-region" tabindex="0" role="region" aria-labelledby="admin-entries-caption">
        <table class="admin-table">
          <caption id="admin-entries-caption" class="visually-hidden">
            {{
              'admin.entries.caption' | transloco: { name: roundName() }
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'admin.entries.image' | transloco }}</th>
              <th scope="col">{{ 'admin.players.nickname' | transloco }}</th>
              <th scope="col">{{ 'admin.entries.prompt' | transloco }}</th>
              <th scope="col">{{ 'admin.entries.provider' | transloco }}</th>
              <th scope="col" class="num">cos</th>
              <th scope="col" class="num">{{ 'admin.entries.floor' | transloco }}</th>
              <th scope="col" class="num">{{ 'admin.entries.score' | transloco }}</th>
              <th scope="col">{{ 'admin.actions' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (entry of entries() ?? []; track entry.entryId) {
              <tr [class.muted]="entry.hidden">
                <td>
                  <button type="button" class="thumb-button" (click)="view(entry)">
                    <img
                      class="thumb"
                      [src]="entry.thumbUrl | apiUrl"
                      alt=""
                      width="64"
                      height="64"
                      loading="lazy"
                      decoding="async"
                    />
                    <span class="visually-hidden">{{
                      'admin.entries.view' | transloco: { nickname: entry.nickname }
                    }}</span>
                  </button>
                </td>
                <th scope="row" class="user-text">
                  {{ entry.nickname }}
                  @if (entry.auto) {
                    <span class="badge neutral">{{ 'admin.entries.auto' | transloco }}</span>
                  }
                  @if (entry.hidden) {
                    <span class="badge warn"
                      ><pb-icon name="eye-off" />{{ 'admin.entries.hidden' | transloco }}</span
                    >
                  }
                </th>
                <td class="prompt user-text">
                  {{ entry.prompt }}
                  @if (entry.promptEn) {
                    <span class="en">EN: {{ entry.promptEn }}</span>
                  }
                </td>
                <td class="mono provider">
                  {{ entry.provider }}<br /><span class="model">{{ entry.model }}</span
                  ><br />{{ entry.embeddingProvider ?? '—' }}
                </td>
                <td class="num">{{ entry.cos | pbNum: 4 : locale() }}</td>
                <td class="num">{{ entry.floor | pbNum: 4 : locale() }}</td>
                <td class="num score">{{ entry.score | pbNum: 1 : locale() }}</td>
                <td class="actions">
                  <button
                    type="button"
                    class="btn btn-small"
                    [attr.aria-disabled]="busy() ? 'true' : null"
                    (click)="toggle(entry)"
                  >
                    <pb-icon [name]="entry.hidden ? 'eye' : 'eye-off'" />
                    {{ (entry.hidden ? 'admin.entries.show' : 'admin.entries.hide') | transloco }}
                    <span class="visually-hidden">{{ entry.nickname }}</span>
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="8" class="admin-hint">
                  {{ (entries() ? 'admin.entries.empty' : 'admin.loading') | transloco }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="admin-hint">{{ 'admin.entries.none' | transloco }}</p>
    }

    <pb-image-dialog
      [heading]="viewing()?.nickname ?? ''"
      [imageUrl]="viewing()?.imageUrl ?? null"
      [alt]="'admin.entries.alt' | transloco: { nickname: viewing()?.nickname ?? '' }"
      [caption]="viewing()?.prompt ?? null"
      captionLabel="prompt.txt"
    />
  `,
  styles: `
    @layer components {
      .picker {
        display: flex;
        flex: 1 1 16rem;
        align-items: center;
        gap: var(--space-2);
        min-inline-size: 0;
        max-inline-size: 32rem;
      }

      /* A long round name must not set the select's width (60 characters at 320 px). */
      .picker select {
        flex: 1;
        inline-size: 100%;
        min-inline-size: 0;
        min-block-size: var(--tap-target);
      }

      .thumb-button {
        display: block;
        padding: 0;
        border: var(--border-width) solid var(--color-border-strong);
        border-radius: var(--radius-sm);
        background: none;
        cursor: zoom-in;
      }

      .prompt {
        min-inline-size: 14rem;
        max-inline-size: 28rem;
      }

      .en {
        display: block;
        color: var(--color-text-muted);
      }

      .provider {
        font-size: var(--text-sm);
        white-space: nowrap;
      }

      .model {
        color: var(--color-text-muted);
      }

      .score {
        font-weight: 700;
      }

      .admin-table th pb-icon {
        --icon-size: 1em;
      }

      .admin-table th .badge {
        margin-inline-start: var(--space-1);
      }
    }
  `,
})
export class AdminEntries {
  private readonly api = inject(AdminApi);
  private readonly live = inject(AdminStateService);
  private readonly rounds = inject(AdminRoundsService);
  private readonly language = inject(LanguageService);
  private readonly dialog = viewChild.required(ImageDialog);

  protected readonly entries = signal<AdminEntry[] | null>(null);
  protected readonly error = signal<ErrorMessage | null>(null);
  protected readonly busy = signal(false);
  protected readonly viewing = signal<AdminEntry | null>(null);

  protected readonly locale = computed(() => {
    this.language.language();
    return this.language.localeTag();
  });
  /** Rounds this city has started, newest first. */
  protected readonly playedRounds = computed(() =>
    (this.rounds.rounds() ?? [])
      .filter(
        (round) => (ownRun(round, this.rounds.city())?.status ?? 'NOT_STARTED') !== 'NOT_STARTED',
      )
      .reverse(),
  );
  private readonly currentRoundId = computed(
    () => this.live.state()?.round?.id ?? this.playedRounds()[0]?.id ?? null,
  );
  /**
   * The picked round; follows the city's current round until the admin picks another. Linked to an id
   * (not to the whole state), so a poll that changes only counters keeps the admin's pick.
   */
  protected readonly roundId = linkedSignal<string | null>(() => this.currentRoundId());
  protected readonly roundName = computed(
    () => this.playedRounds().find((round) => round.id === this.roundId())?.name ?? '',
  );

  constructor() {
    effect(() => {
      this.live.version();
      const id = this.roundId();
      untracked(() => void this.load(id));
    });
  }

  protected view(entry: AdminEntry): void {
    this.viewing.set(entry);
    this.dialog().open();
  }

  protected async toggle(entry: AdminEntry): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.api.hideEntry(entry.entryId, !entry.hidden);
      await this.load(this.roundId());
      this.live.refresh();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(roundId: string | null): Promise<void> {
    if (!roundId) {
      this.entries.set(null);
      return;
    }
    try {
      const entries = await this.api.entries(roundId);
      if (roundId === this.roundId()) {
        this.entries.set(entries);
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
