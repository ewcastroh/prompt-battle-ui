import {
  DOCUMENT,
  DestroyRef,
  Injector,
  Service,
  computed,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ApiError } from '../../core/api/api-error';
import { AttemptStatus, CreateAttemptResponse, Me } from '../../core/api/api.models';
import { runScreenTransition } from '../../core/ui/screen-transition';
import { PlayerApi } from './player-api';
import { JoinReason, PlayerScreen, PlayerSession, screenFor } from './player-screen';
import { PlayerTokenStore } from './player-token-store';
import { ServerClock } from '../../core/time/server-clock';

/** At most one `GET /api/me` per 1.5 s (SPEC §13, D-008). */
export const POLL_INTERVAL_MS = 1500;
/** Backoff ceiling after network errors or 5xx (API.md §3). */
export const MAX_BACKOFF_MS = 10_000;
/** Consecutive failed polls before the phone says the connection is lost (one blip stays quiet). */
export const OFFLINE_AFTER_FAILURES = 2;

/** Delay before the next poll after `failures` consecutive failures: ×2 per failure, capped. */
export function backoffDelay(failures: number): number {
  return Math.min(MAX_BACKOFF_MS, POLL_INTERVAL_MS * 2 ** Math.max(0, failures));
}

/** The player's generation in progress: from the server, or the attempt the API just accepted. */
export interface GenerationInFlight {
  readonly attemptId: string;
  readonly status: Extract<AttemptStatus, 'QUEUED' | 'GENERATING'>;
  readonly queuePosition: number | null;
}

/**
 * The player's view of the game in one city (PLAN U2), provided by the player route.
 *
 * - Polls `GET /api/me` at most every 1.5 s with `If-None-Match`; a 304 keeps the current state.
 * - Pauses while the tab is hidden; polls as soon as allowed when it comes back, the device goes
 *   online, or the page returns from the back/forward cache. No trigger ever polls twice in 1.5 s.
 * - On a network error, a timeout or a 5xx, backs off ×2 up to 10 s, then returns to 1.5 s after a
 *   success.
 * - 401 (unknown token, event reset) or `PLAYER_KICKED`: forgets the city's token and shows the join
 *   form with the reason.
 * - Tracks the server clock offset from the `Date` header for countdowns.
 * - Poll results that started before a write (generate, select entry) finished are dropped, so the
 *   screen never flips back to the state from before the player's own action.
 *
 * All state lives in signals; this is the only place that talks to the player endpoints.
 */
@Service({ autoProvided: false })
export class PlayerStateService {
  private readonly api = inject(PlayerApi);
  private readonly tokens = inject(PlayerTokenStore);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly clock = new ServerClock();

  private city: string | null = null;
  private token: string | null = null;
  private etag: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by `start()`: responses of an older run are ignored. */
  private run = 0;
  /** Bumped when a write completes: poll results that started earlier are dropped. */
  private writes = 0;
  private polling = false;
  private pollAgain = false;
  private failures = 0;
  /** When the last `GET /api/me` started: no trigger may poll again within 1.5 s. */
  private lastPollAt = -Infinity;
  private selecting = 0;
  private destroyed = false;
  private readonly screenSettledListeners = new Set<(screen: PlayerScreen) => void>();

  private readonly sessionSignal = signal<PlayerSession>({ kind: 'starting' });
  private readonly offlineSignal = signal(false);
  private readonly offsetSignal = signal(0);
  private readonly submittingSignal = signal(false);
  private readonly acceptedSignal = signal<CreateAttemptResponse | null>(null);
  private readonly pendingEntrySignal = signal<string | null>(null);

  readonly session = this.sessionSignal.asReadonly();
  readonly screen = computed<PlayerScreen>(() => screenFor(this.session()));
  readonly me = computed<Me | null>(() => {
    const session = this.session();
    return session.kind === 'playing' ? session.me : null;
  });
  /** The city's join reason while the join form shows (lost session), else `null`. */
  readonly joinReason = computed<JoinReason | null>(() => {
    const session = this.session();
    return session.kind === 'join' ? session.reason : null;
  });
  /** True after consecutive failed polls, until one succeeds. */
  readonly offline = this.offlineSignal.asReadonly();
  /** Server clock − local clock, in ms. */
  readonly serverOffset = this.offsetSignal.asReadonly();
  /** True while `POST /api/rounds/current/attempts` is in flight. */
  readonly submitting = this.submittingSignal.asReadonly();
  /** The selected entry to show: the one being submitted, else the server's. */
  readonly entryAttemptId = computed<string | null>(
    () => this.pendingEntrySignal() ?? this.me()?.round?.entryAttemptId ?? null,
  );
  /** True while an entry selection is waiting for the server. */
  readonly entryPending = computed(() => this.pendingEntrySignal() !== null);
  readonly generation = computed<GenerationInFlight | null>(() => {
    const live = this.me()?.attempts.find(
      (attempt) => attempt.status === 'QUEUED' || attempt.status === 'GENERATING',
    );
    if (live) {
      return {
        attemptId: live.id,
        status: live.status as GenerationInFlight['status'],
        queuePosition: live.queuePosition,
      };
    }
    const accepted = this.acceptedSignal();
    return accepted
      ? { attemptId: accepted.attemptId, status: 'QUEUED', queuePosition: accepted.queuePosition }
      : null;
  });

  constructor() {
    const onVisibility = () => this.onVisibilityChange();
    const onOnline = () => this.retryNow();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        this.retryNow();
      }
    };
    const window = this.document.defaultView;
    this.document.addEventListener('visibilitychange', onVisibility);
    window?.addEventListener('online', onOnline);
    window?.addEventListener('pageshow', onPageShow);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      // Responses still in flight belong to a finished run and are ignored.
      this.run++;
      this.clearTimer();
      this.screenSettledListeners.clear();
      this.document.removeEventListener('visibilitychange', onVisibility);
      window?.removeEventListener('online', onOnline);
      window?.removeEventListener('pageshow', onPageShow);
    });
  }

  /** Starts (or restarts, for another city) the session: a stored token resumes, else join. */
  start(city: string): void {
    if (this.city === city) {
      return;
    }
    this.run++;
    this.clearTimer();
    this.city = city;
    this.token = this.tokens.get(city);
    this.etag = null;
    this.polling = false;
    this.pollAgain = false;
    this.failures = 0;
    this.lastPollAt = -Infinity;
    this.selecting = 0;
    this.clock.reset();
    this.offsetSignal.set(0);
    this.offlineSignal.set(false);
    this.submittingSignal.set(false);
    this.acceptedSignal.set(null);
    this.pendingEntrySignal.set(null);
    if (!this.token) {
      this.sessionSignal.set({ kind: 'join', reason: null });
      return;
    }
    this.sessionSignal.set({ kind: 'starting' });
    void this.poll();
  }

  /**
   * Joins the city with `nickname`. Resolves once the first `GET /api/me` has been tried, so the join
   * form stays busy until the next screen can render. Returns the error to show in the form, if any.
   */
  async join(nickname: string): Promise<ApiError | null> {
    const city = this.city;
    if (!city) {
      return null;
    }
    const run = this.run;
    try {
      // A still-valid token makes the API return the same player (200) instead of a new one.
      const joined = await this.api.join(city, nickname, this.token);
      if (run !== this.run) {
        return null;
      }
      if (joined.city !== city) {
        return new ApiError(0, 'UNKNOWN');
      }
      this.tokens.set(city, joined.token);
      this.token = joined.token;
      this.etag = null;
      this.failures = 0;
      await this.poll();
      return null;
    } catch (error) {
      return run === this.run ? asApiError(error) : null;
    }
  }

  /** Submits a prompt. Returns the error to show next to the editor, if any. */
  async generate(prompt: string): Promise<ApiError | null> {
    const token = this.token;
    if (!token || this.submittingSignal()) {
      return null;
    }
    const run = this.run;
    this.submittingSignal.set(true);
    try {
      const accepted = await this.api.createAttempt(token, prompt);
      if (run === this.run) {
        this.acceptedSignal.set(accepted);
      }
      return null;
    } catch (error) {
      return run === this.run ? this.onWriteError(error) : null;
    } finally {
      if (run === this.run) {
        this.submittingSignal.set(false);
        this.writeCompleted();
      }
    }
  }

  /** Marks an attempt as the player's entry. Returns the error to show, if any. */
  async selectEntry(attemptId: string): Promise<ApiError | null> {
    const token = this.token;
    if (!token) {
      return null;
    }
    const run = this.run;
    this.selecting++;
    this.pendingEntrySignal.set(attemptId);
    try {
      await this.api.selectEntry(token, attemptId);
      return null;
    } catch (error) {
      if (run !== this.run) {
        return null;
      }
      if (this.pendingEntrySignal() === attemptId) {
        this.pendingEntrySignal.set(null);
      }
      return this.onWriteError(error);
    } finally {
      if (run === this.run) {
        this.selecting--;
        this.writeCompleted();
      }
    }
  }

  /**
   * Polls as soon as allowed (the "retry" control, `online`, back/forward cache): skips the backoff
   * wait but never polls twice within 1.5 s. Keeps the failure count.
   */
  retryNow(): void {
    if (this.token && !this.destroyed) {
      void this.poll();
    }
  }

  /**
   * Registers `listener` for screen changes, called once the new screen is rendered and its view
   * transition (if any) has finished. Returns the unsubscribe function.
   */
  onScreenSettled(listener: (screen: PlayerScreen) => void): () => void {
    this.screenSettledListeners.add(listener);
    return () => this.screenSettledListeners.delete(listener);
  }

  // ------------------------------------------------------------------ polling

  private async poll(): Promise<void> {
    if (this.destroyed || !this.token) {
      return;
    }
    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    if (this.document.visibilityState === 'hidden') {
      // Resumed by the visibilitychange listener.
      return;
    }
    const wait = this.lastPollAt + POLL_INTERVAL_MS - Date.now();
    if (wait > 0) {
      // At most one poll per 1.5 s (API.md §3), whatever asked for it (a write, retry, tab return).
      this.schedule(wait);
      return;
    }
    this.clearTimer();
    this.polling = true;
    this.lastPollAt = Date.now();
    const run = this.run;
    const writes = this.writes;
    const token = this.token;
    const sentAt = Date.now();
    let next: number | null = POLL_INTERVAL_MS;
    try {
      const response = await this.api.me(token, this.etag);
      if (run !== this.run) {
        return;
      }
      if (response.serverDate !== null) {
        this.offsetSignal.set(
          this.clock.add({ serverDate: response.serverDate, sentAt, receivedAt: Date.now() }),
        );
      }
      this.failures = 0;
      this.offlineSignal.set(false);
      if (writes !== this.writes) {
        // Started before the player's own write finished: may be stale. Ask again.
        this.pollAgain = true;
      } else {
        // Started after every completed write: this is the server's truth (200 or 304).
        this.acceptedSignal.set(null);
        if (this.selecting === 0) {
          this.pendingEntrySignal.set(null);
        }
        if (response.status === 200 && response.me) {
          this.etag = response.etag;
          this.applyMe(response.me);
        }
      }
    } catch (error) {
      if (run !== this.run) {
        return;
      }
      next = this.onPollError(error);
    } finally {
      if (run === this.run) {
        this.polling = false;
        if (next !== null && this.token) {
          const again = this.pollAgain;
          this.pollAgain = false;
          this.schedule(again ? 0 : next);
        }
      }
    }
  }

  /** Handles a failed poll; returns the delay before the next one, or `null` to stop. */
  private onPollError(error: unknown): number | null {
    const apiError = asApiError(error);
    if (apiError.code === 'UNAUTHORIZED' || apiError.status === 401) {
      this.endSession('UNAUTHORIZED');
      return null;
    }
    if (apiError.code === 'PLAYER_KICKED') {
      this.endSession('PLAYER_KICKED');
      return null;
    }
    this.failures++;
    if (this.failures >= OFFLINE_AFTER_FAILURES) {
      this.offlineSignal.set(true);
    }
    const retryAfterSec = Number(apiError.params['retryAfterSec']);
    if (apiError.code === 'RATE_LIMITED' && retryAfterSec > 0) {
      return Math.min(MAX_BACKOFF_MS, Math.max(POLL_INTERVAL_MS, retryAfterSec * 1000));
    }
    return backoffDelay(this.failures);
  }

  private schedule(delay: number): void {
    this.clearTimer();
    if (this.destroyed || !this.token || this.document.visibilityState === 'hidden') {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private onVisibilityChange(): void {
    if (this.document.visibilityState === 'hidden') {
      this.clearTimer();
    } else {
      this.retryNow();
    }
  }

  // ------------------------------------------------------------------ state

  private writeCompleted(): void {
    this.writes++;
    void this.poll();
  }

  private onWriteError(error: unknown): ApiError | null {
    const apiError = asApiError(error);
    if (apiError.code === 'UNAUTHORIZED' || apiError.status === 401) {
      this.endSession('UNAUTHORIZED');
      return null;
    }
    if (apiError.code === 'PLAYER_KICKED') {
      this.endSession('PLAYER_KICKED');
      return null;
    }
    return apiError;
  }

  private applyMe(me: Me): void {
    if (me.player.city !== this.city) {
      // A token from another city: never show its state here.
      this.endSession('UNAUTHORIZED');
      return;
    }
    this.commit({ kind: 'playing', me });
  }

  private endSession(reason: JoinReason): void {
    if (this.city) {
      this.tokens.clear(this.city);
    }
    this.token = null;
    this.etag = null;
    this.failures = 0;
    this.lastPollAt = -Infinity;
    this.clearTimer();
    this.offlineSignal.set(false);
    this.submittingSignal.set(false);
    this.acceptedSignal.set(null);
    this.pendingEntrySignal.set(null);
    this.commit({ kind: 'join', reason });
  }

  /** Sets the session; a screen change runs as a view transition and notifies listeners. */
  private commit(next: PlayerSession): void {
    const before = untracked(() => screenFor(this.sessionSignal()));
    const after = screenFor(next);
    if (before === after) {
      this.sessionSignal.set(next);
      return;
    }
    runScreenTransition(
      this.document,
      this.injector,
      () => this.sessionSignal.set(next),
      () => {
        if (!this.destroyed) {
          this.screenSettledListeners.forEach((listener) => listener(after));
        }
      },
    );
  }
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN');
}
