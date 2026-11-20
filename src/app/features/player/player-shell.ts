import {
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Me } from '../../core/api/api.models';
import { CityService } from '../../core/city/city.service';
import { LanguageService } from '../../core/i18n/language.service';
import { Announcer } from '../../core/ui/announcer';
import { AppHeader } from '../../shared/app-header/app-header';
import { Icon } from '../../shared/icon/icon';
import { InlineMessage } from '../../shared/inline-message/inline-message';
import { Spinner } from '../../shared/spinner/spinner';
import { RoundClosedScreen } from './closed/round-closed-screen';
import { FinalScreen } from './final/final-screen';
import { JoinScreen } from './join/join-screen';
import { LobbyScreen } from './lobby/lobby-screen';
import { PlayerScreen } from './player-screen';
import { PlayerStateService } from './player-state.service';
import { RoundOpenScreen } from './round/round-open-screen';
import { WaitingScreen, waitingMessageKey } from './waiting/waiting-screen';

const TITLE_ID = 'player-title';

/** Header title (the page's `<h1>`) per screen, as a translation key and params. */
export function screenTitle(
  screen: PlayerScreen,
  me: Me | null,
): { key: string; params: Record<string, unknown> } | { text: string } {
  switch (screen) {
    case 'join':
      return { key: 'app.eventTitle', params: {} };
    case 'lobby':
      return { key: 'player.title.lobby', params: { nickname: me?.player.nickname ?? '' } };
    case 'round-open':
      // The round's own name (user content, as is).
      return me?.round ? { text: me.round.name } : { key: 'player.title.roundOpen', params: {} };
    case 'round-closed':
      return me?.round?.scored === false
        ? { key: 'player.title.practiceClosed', params: {} }
        : { key: 'player.title.roundClosed', params: {} };
    case 'waiting':
      return { key: `player.title.waiting.${me?.phase ?? 'ROUND_SCORED'}`, params: {} };
    case 'final':
      return { key: 'player.title.final', params: {} };
    case 'loading':
      return { key: 'player.title.loading', params: {} };
  }
}

/** Announcement when a screen appears and focus stayed where it was. */
function screenAnnouncement(screen: PlayerScreen, me: Me | null): string | null {
  switch (screen) {
    case 'lobby':
      return 'player.announce.lobby';
    case 'round-open':
      return 'player.announce.roundOpen';
    case 'round-closed':
      return me?.round?.scored === false
        ? 'player.announce.practiceClosed'
        : 'player.announce.roundClosed';
    case 'waiting':
      return me ? waitingMessageKey(me.phase) : null;
    case 'final':
      return 'player.announce.final';
    default:
      return null;
  }
}

/**
 * `/play/:city`: the player's phone (SPEC §10.4). One screen at a time, chosen by the API phase
 * (see `screenFor`); `PlayerStateService` polls and owns all state.
 *
 * After a screen change (a cross-fade where View Transitions exist), focus moves to the new `<h1>` if
 * the focused element went away with the old screen; otherwise the change is announced politely.
 * The document title follows the screen.
 */
@Component({
  selector: 'pb-player-shell',
  imports: [
    AppHeader,
    FinalScreen,
    Icon,
    InlineMessage,
    JoinScreen,
    LobbyScreen,
    RoundClosedScreen,
    RoundOpenScreen,
    Spinner,
    TranslocoPipe,
    WaitingScreen,
  ],
  providers: [PlayerStateService],
  templateUrl: './player-shell.html',
  styleUrl: './player-shell.css',
})
export class PlayerShell {
  private readonly cities = inject(CityService);
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly announcer = inject(Announcer);
  protected readonly state = inject(PlayerStateService);

  /** Route param, bound with `withComponentInputBinding()`. */
  readonly city = input.required<string>();

  protected readonly titleId = TITLE_ID;
  protected readonly cityName = computed(() => this.cities.find(this.city())?.name ?? null);
  protected readonly offlineDismissed = signal(false);

  protected readonly heading = computed(() => {
    this.language.language();
    this.language.translationsLoaded();
    const title = screenTitle(this.state.screen(), this.state.me());
    return 'text' in title ? title.text : this.transloco.translate(title.key, title.params);
  });

  constructor() {
    effect(() => {
      const city = this.city();
      untracked(() => this.state.start(city));
    });

    effect(() => {
      this.language.language();
      this.language.translationsLoaded();
      const screen = this.state.screen();
      const page = this.transloco.translate(`player.docTitle.${screen}`);
      this.title.setTitle(`${page} | ${this.transloco.translate('app.name')}`);
    });

    // Connection lost / back: announced (the banner itself is inserted, not a live region).
    let wasOffline = false;
    effect(() => {
      const offline = this.state.offline();
      if (offline === wasOffline) {
        return;
      }
      wasOffline = offline;
      untracked(() => {
        if (offline) {
          this.offlineDismissed.set(false);
        }
        this.announcer.announce(
          this.transloco.translate(
            offline ? 'player.connection.lost' : 'player.connection.restored',
          ),
        );
      });
    });

    // Remember whether focus was last inside the screen (main): only then can a screen change take
    // the focused control away. On first load nothing was focused, so focus is left alone.
    const onFocusIn = (event: FocusEvent) => {
      this.focusWasInScreen = !!(event.target as Element | null)?.closest?.('main');
    };
    this.document.addEventListener('focusin', onFocusIn);
    const unsubscribe = this.state.onScreenSettled((screen) => this.onScreenSettled(screen));
    inject(DestroyRef).onDestroy(() => {
      unsubscribe();
      this.document.removeEventListener('focusin', onFocusIn);
    });
  }

  private focusWasInScreen = false;

  protected retry(): void {
    this.state.retryNow();
  }

  private onScreenSettled(screen: PlayerScreen): void {
    const active = this.document.activeElement;
    const focusLost = !active || active === this.document.body;
    let movedFocus = false;
    if (focusLost && this.focusWasInScreen && screen !== 'loading') {
      // The focused control left with the old screen: start the new one at its heading.
      this.focusWasInScreen = false;
      this.document.getElementById(TITLE_ID)?.focus();
      movedFocus = true;
    }
    const reason = screen === 'join' ? this.state.joinReason() : null;
    if (reason) {
      // Why the session ended is not in the heading: always say it, after the heading is read.
      this.announcer.announce(this.transloco.translate(`errors.${reason}`), 800);
      return;
    }
    // The focused heading already says where the player is; otherwise announce the change.
    const key = movedFocus ? null : screenAnnouncement(screen, this.state.me());
    if (key) {
      this.announcer.announce(
        this.transloco.translate(key, { city: this.state.me()?.player.cityName ?? '' }),
      );
    }
  }
}
