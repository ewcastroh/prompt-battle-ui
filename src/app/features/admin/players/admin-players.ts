import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiError } from '../../../core/api/api-error';
import { AdminPlayer } from '../../../core/api/api.models';
import { ErrorMessage, errorMessage } from '../../../core/api/error-messages';
import { LanguageService } from '../../../core/i18n/language.service';
import { Announcer } from '../../../core/ui/announcer';
import { Icon } from '../../../shared/icon/icon';
import { InlineMessage } from '../../../shared/inline-message/inline-message';
import { AdminApi } from '../admin-api';
import { NumberPipe, TimePipe } from '../admin-format';
import { AdminSessionService } from '../admin-session.service';
import { AdminStateService } from '../admin-state.service';
import { ConfirmDialog } from '../confirm-dialog';

/**
 * Own-city players (SPEC §10.6): nickname, claim code, join time, attempts, blocks and the 3-block
 * flag, total, kicked; rename (dialog) and kick (confirmed). Reloads when the live state changes.
 * Flagged players are listed first so the admin sees them.
 */
@Component({
  selector: 'pb-admin-players',
  imports: [ConfirmDialog, Icon, InlineMessage, NumberPipe, TimePipe, TranslocoPipe],
  template: `
    <div class="section-head">
      <h2>{{ 'admin.players.title' | transloco }}</h2>
      <p class="admin-hint">
        {{ 'admin.players.count' | transloco: { count: active(), kicked: kickedCount() } }}
      </p>
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

    <div class="table-region" tabindex="0" role="region" aria-labelledby="admin-players-caption">
      <table class="admin-table">
        <caption id="admin-players-caption" class="visually-hidden">
          {{
            'admin.players.title' | transloco
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">{{ 'admin.players.nickname' | transloco }}</th>
            <th scope="col">{{ 'admin.players.claimCode' | transloco }}</th>
            <th scope="col">{{ 'admin.players.joinedAt' | transloco }}</th>
            <th scope="col" class="num">{{ 'admin.players.attempts' | transloco }}</th>
            <th scope="col" class="num">{{ 'admin.players.blocked' | transloco }}</th>
            <th scope="col" class="num">{{ 'admin.players.total' | transloco }}</th>
            <th scope="col">{{ 'admin.players.status' | transloco }}</th>
            <th scope="col">{{ 'admin.actions' | transloco }}</th>
          </tr>
        </thead>
        <tbody>
          @for (player of sorted(); track player.id) {
            <tr [class.muted]="player.kicked">
              <th scope="row" class="user-text">{{ player.nickname }}</th>
              <td class="mono">{{ player.claimCode }}</td>
              <td class="mono nowrap">{{ player.joinedAt | pbTime: locale() }}</td>
              <td class="num">{{ player.attemptsCount }}</td>
              <td class="num">{{ player.blockedCount }}</td>
              <td class="num">{{ player.total | pbNum: 1 : locale() }}</td>
              <td>
                @if (player.kicked) {
                  <span class="badge neutral"
                    ><pb-icon name="user-x" />{{ 'admin.players.kicked' | transloco }}</span
                  >
                } @else if (player.flagged) {
                  <span class="badge danger"
                    ><pb-icon name="flag" />{{ 'admin.players.flagged' | transloco }}</span
                  >
                } @else {
                  <span class="badge ok">{{ 'admin.players.active' | transloco }}</span>
                }
              </td>
              <td class="actions">
                @if (!player.kicked) {
                  <button type="button" class="btn btn-small" (click)="openRename(player)">
                    <pb-icon name="pencil" />
                    {{ 'admin.players.rename' | transloco }}
                    <span class="visually-hidden">{{ player.nickname }}</span>
                  </button>
                  <button type="button" class="btn btn-small" (click)="confirmKick(player)">
                    <pb-icon name="user-x" />
                    {{ 'admin.players.kick' | transloco }}
                    <span class="visually-hidden">{{ player.nickname }}</span>
                  </button>
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="8" class="admin-hint">
                {{ (players() ? 'admin.players.empty' : 'admin.loading') | transloco }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <dialog
      #renameDialog
      class="admin-dialog"
      aria-labelledby="rename-title"
      (close)="onRenameClosed()"
    >
      <form class="dialog-body" novalidate (submit)="rename($event)">
        <h2 id="rename-title" class="dialog-title">
          {{ 'admin.players.renameTitle' | transloco: { nickname: target()?.nickname ?? '' } }}
        </h2>
        <div class="field">
          <label class="field-label" for="rename-input">{{
            'admin.players.newNickname' | transloco
          }}</label>
          <p class="field-hint" id="rename-hint">
            {{ 'player.join.nicknameHint' | transloco: { min: 3, max: 16 } }}
          </p>
          <input
            #renameInput
            id="rename-input"
            class="text-input"
            type="text"
            maxlength="16"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            autofocus
            [attr.aria-invalid]="renameError() ? 'true' : 'false'"
            [attr.aria-describedby]="'rename-hint' + (renameError() ? ' rename-error' : '')"
            (input)="renameError.set(null)"
          />
          @if (renameError(); as message) {
            <p class="field-error" id="rename-error">
              <pb-icon name="circle-alert" />
              <span>{{ message.key | transloco: message.params }}</span>
            </p>
          }
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn" (click)="renameDialog.close()">
            {{ 'admin.confirm.cancel' | transloco }}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            [attr.aria-disabled]="renaming() ? 'true' : null"
          >
            {{ (renaming() ? 'admin.working' : 'admin.players.rename') | transloco }}
          </button>
        </div>
      </form>
    </dialog>

    <pb-confirm-dialog
      #kickDialog
      [heading]="'admin.players.kickTitle' | transloco: { nickname: target()?.nickname ?? '' }"
      [confirmLabel]="'admin.players.kick' | transloco"
      [action]="kickAction"
    >
      <p>{{ 'admin.players.kickBody' | transloco }}</p>
    </pb-confirm-dialog>
  `,
  styles: `
    @layer components {
      .admin-table pb-icon {
        --icon-size: 1em;
      }
    }
  `,
})
export class AdminPlayers {
  private readonly api = inject(AdminApi);
  private readonly session = inject(AdminSessionService);
  private readonly live = inject(AdminStateService);
  private readonly language = inject(LanguageService);
  private readonly announcer = inject(Announcer);
  private readonly renameDialog = viewChild.required<ElementRef<HTMLDialogElement>>('renameDialog');
  private readonly renameInput = viewChild.required<ElementRef<HTMLInputElement>>('renameInput');
  private readonly kickDialog = viewChild.required<ConfirmDialog>('kickDialog');

  protected readonly players = signal<AdminPlayer[] | null>(null);
  protected readonly error = signal<ErrorMessage | null>(null);
  protected readonly target = signal<AdminPlayer | null>(null);
  protected readonly renaming = signal(false);
  protected readonly renameError = signal<ErrorMessage | null>(null);
  private renameOpen = false;

  protected readonly locale = computed(() => {
    this.language.language();
    return this.language.localeTag();
  });
  protected readonly sorted = computed(() =>
    [...(this.players() ?? [])].sort(
      (a, b) =>
        Number(a.kicked) - Number(b.kicked) ||
        Number(b.flagged) - Number(a.flagged) ||
        a.joinedAt.localeCompare(b.joinedAt),
    ),
  );
  protected readonly active = computed(() => this.players()?.filter((p) => !p.kicked).length ?? 0);
  protected readonly kickedCount = computed(
    () => this.players()?.filter((p) => p.kicked).length ?? 0,
  );

  protected readonly kickAction = async (): Promise<ApiError | null> => {
    const player = this.target();
    if (!player) {
      return null;
    }
    try {
      await this.api.kick(player.id);
      await this.load();
      return null;
    } catch (error) {
      return error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN');
    }
  };

  constructor() {
    effect(() => {
      this.live.version();
      if (this.session.ready()) {
        untracked(() => void this.load());
      }
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.renameOpen) {
        this.announcer.modalClosed();
      }
    });
  }

  protected openRename(player: AdminPlayer): void {
    this.target.set(player);
    this.renameError.set(null);
    this.renameInput().nativeElement.value = player.nickname;
    this.renameOpen = true;
    this.announcer.modalOpened();
    this.renameDialog().nativeElement.showModal();
  }

  protected onRenameClosed(): void {
    if (this.renameOpen) {
      this.renameOpen = false;
      this.announcer.modalClosed();
    }
  }

  protected confirmKick(player: AdminPlayer): void {
    this.target.set(player);
    this.kickDialog().open();
  }

  protected async rename(event: Event): Promise<void> {
    event.preventDefault();
    const player = this.target();
    if (!player || this.renaming()) {
      return;
    }
    const nickname = this.renameInput().nativeElement.value.trim();
    this.renaming.set(true);
    try {
      await this.api.rename(player.id, nickname);
      this.renameDialog().nativeElement.close();
      await this.load();
    } catch (error) {
      this.renameError.set(errorMessage(error));
      this.renameInput().nativeElement.focus();
    } finally {
      this.renaming.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      this.players.set(await this.api.players());
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
