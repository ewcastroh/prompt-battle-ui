import { HttpClient } from '@angular/common/http';
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
import { StageState } from '../../core/api/api.models';
import { conditionalGet } from '../../core/api/conditional-get';
import { Poller } from '../../core/api/poller';
import { ServerClock } from '../../core/time/server-clock';
import { runScreenTransition } from '../../core/ui/screen-transition';
import { StageScene, sceneFor, sceneKey } from './stage-scene';

/** Stage state every 1.5 s at most (API.md §3, D-008). */
export const STAGE_POLL_MS = 1500;
/** Consecutive failed polls before the stage shows a quiet "reconnecting" note. */
const OFFLINE_AFTER_FAILURES = 3;

/**
 * The projector's view of one city (PLAN U3), provided by the stage route. Polls
 * `GET /api/cities/{city}/stage/state` with `If-None-Match` (a 304 keeps the state), never pauses,
 * backs off ×2 up to 10 s on failures, and tracks the server clock from the `Date` header.
 *
 * The stage only shows what this endpoint returns, so it can never reveal more than the city's
 * admin has (SPEC §6.2). A scene change (a phase, or a reveal step) runs as a view transition.
 */
@Service({ autoProvided: false })
export class StageStateService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly clock = new ServerClock();
  private city: string | null = null;
  private etag: string | null = null;
  private run = 0;
  private destroyed = false;

  private readonly stateSignal = signal<StageState | null>(null);
  private readonly errorSignal = signal<ApiError | null>(null);
  private readonly failuresSignal = signal(0);
  private readonly offsetSignal = signal(0);

  readonly state = this.stateSignal.asReadonly();
  /** A fatal error (unknown city); the stage shows it instead of a scene. */
  readonly error = this.errorSignal.asReadonly();
  readonly offline = computed(() => this.failuresSignal() >= OFFLINE_AFTER_FAILURES);
  /** Server clock − local clock, in ms. */
  readonly serverOffset = this.offsetSignal.asReadonly();
  readonly scene = computed<StageScene>(() => sceneFor(this.stateSignal()));

  private readonly poller = new Poller({
    intervalMs: STAGE_POLL_MS,
    run: () => this.poll(),
    onFailures: (failures) => this.failuresSignal.set(failures),
  });

  constructor() {
    const window = this.document.defaultView;
    const onOnline = () => this.poller.now();
    window?.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.run++;
      this.poller.stop();
      window?.removeEventListener('online', onOnline);
    });
  }

  start(city: string): void {
    if (this.city === city) {
      return;
    }
    this.run++;
    this.city = city;
    this.etag = null;
    this.clock.reset();
    this.offsetSignal.set(0);
    this.stateSignal.set(null);
    this.errorSignal.set(null);
    this.failuresSignal.set(0);
    this.poller.stop();
    this.poller.start();
  }

  private async poll(): Promise<boolean> {
    const city = this.city;
    if (!city || this.destroyed) {
      return false;
    }
    const run = this.run;
    const sentAt = Date.now();
    let response;
    try {
      response = await conditionalGet<StageState>(
        this.http,
        `/api/cities/${encodeURIComponent(city)}/stage/state`,
        this.etag,
      );
    } catch (error) {
      if (run === this.run && error instanceof ApiError && error.code === 'CITY_NOT_FOUND') {
        this.errorSignal.set(error);
        return false;
      }
      throw error;
    }
    if (run !== this.run) {
      return true;
    }
    if (response.serverDate !== null) {
      this.offsetSignal.set(
        this.clock.add({ serverDate: response.serverDate, sentAt, receivedAt: Date.now() }),
      );
    }
    if (response.status === 200 && response.body) {
      this.etag = response.etag;
      this.apply(response.body);
    }
    return true;
  }

  private apply(next: StageState): void {
    const before = untracked(() => sceneKey(this.stateSignal()));
    const after = sceneKey(next);
    if (before === after || untracked(() => this.stateSignal()) === null) {
      this.stateSignal.set(next);
      return;
    }
    runScreenTransition(
      this.document,
      this.injector,
      () => this.stateSignal.set(next),
      () => undefined,
    );
  }
}
