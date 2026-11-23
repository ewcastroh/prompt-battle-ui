import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { ApiError } from '../../core/api/api-error';
import { AdminState } from '../../core/api/api.models';
import { Poller } from '../../core/api/poller';
import { ServerClock } from '../../core/time/server-clock';
import { AdminApi } from './admin-api';

/** Admin state every 2 s (API.md §3). */
export const ADMIN_POLL_MS = 2000;

export type RunAction = Parameters<AdminApi['runAction']>[0];

/**
 * The own city's live state for the console (`GET /api/admin/state`, ETag, every 2 s) and the run
 * controls. Run actions go one at a time: while one is in flight, others (a double-tapped "Next")
 * are ignored, so each tap moves the podium exactly one step. An action's response is the new state,
 * and a poll that was already in flight when it arrived is dropped: it may predate the action, and
 * showing the old step for 2 s would invite a second tap.
 *
 * `version` changes whenever the state body changes; panels that list players or entries reload
 * on it instead of polling on their own.
 */
@Service({ autoProvided: false })
export class AdminStateService {
  private readonly api = inject(AdminApi);
  private readonly clock = new ServerClock();
  private etag: string | null = null;
  private running = false;
  /** Bumped when an action's response is applied; polls started before it are stale. */
  private writes = 0;
  /** Settles when the action in flight finishes. */
  private idle: Promise<void> = Promise.resolve();

  private readonly stateSignal = signal<AdminState | null>(null);
  private readonly versionSignal = signal(0);
  private readonly busySignal = signal<RunAction['kind'] | null>(null);
  private readonly offsetSignal = signal(0);
  private readonly failuresSignal = signal(0);

  readonly state = this.stateSignal.asReadonly();
  readonly version = this.versionSignal.asReadonly();
  /** The run action in flight, if any. */
  readonly busy = this.busySignal.asReadonly();
  readonly serverOffset = this.offsetSignal.asReadonly();
  readonly offline = computed(() => this.failuresSignal() >= 2);

  private readonly poller = new Poller({
    intervalMs: ADMIN_POLL_MS,
    run: () => this.poll(),
    onFailures: (failures) => this.failuresSignal.set(failures),
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.poller.stop());
  }

  start(): void {
    if (!this.running) {
      this.running = true;
      this.poller.start();
    }
  }

  stop(): void {
    this.running = false;
    this.poller.stop();
    this.etag = null;
    this.clock.reset();
    this.stateSignal.set(null);
  }

  /** Polls now (after a change made elsewhere, such as a hidden entry). */
  refresh(): void {
    this.poller.now();
  }

  /**
   * Runs a run-control action. Returns the error to show, or `null`; does nothing (and returns
   * `null`) while another action is in flight.
   */
  async act(action: RunAction): Promise<ApiError | null> {
    if (this.busySignal() !== null) {
      return null;
    }
    this.busySignal.set(action.kind);
    let settle!: () => void;
    this.idle = new Promise<void>((resolve) => (settle = resolve));
    try {
      const next = await this.api.runAction(action);
      this.writes++;
      this.apply(next);
      // The next poll's body equals this one; reset the ETag so it can't be skipped as stale.
      this.etag = null;
      return null;
    } catch (error) {
      this.poller.now();
      return error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN');
    } finally {
      this.busySignal.set(null);
      settle();
    }
  }

  /**
   * For a confirmed action (close round, reset podium): waits for the action in flight instead of
   * being dropped, so a confirmation dialog never closes as if it had worked when nothing was sent.
   */
  async actWhenIdle(action: RunAction): Promise<ApiError | null> {
    while (this.busySignal() !== null) {
      await this.idle;
    }
    return this.act(action);
  }

  private async poll(): Promise<boolean> {
    const sentAt = Date.now();
    const writes = this.writes;
    let response;
    try {
      response = await this.api.state(this.etag);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return false;
      }
      throw error;
    }
    if (response.serverDate !== null) {
      this.offsetSignal.set(
        this.clock.add({ serverDate: response.serverDate, sentAt, receivedAt: Date.now() }),
      );
    }
    if (writes !== this.writes) {
      this.poller.now(); // started before an action's response: may be stale, ask again
      return this.running;
    }
    if (response.status === 200 && response.body && this.running) {
      this.etag = response.etag;
      this.apply(response.body);
    }
    return this.running;
  }

  private apply(next: AdminState): void {
    const before = this.stateSignal();
    if (before && JSON.stringify(before) === JSON.stringify(next)) {
      return;
    }
    this.stateSignal.set(next);
    this.versionSignal.update((v) => v + 1);
  }
}
