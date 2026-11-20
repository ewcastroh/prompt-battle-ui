/** Backoff ceiling after network errors or 5xx (API.md §3). */
export const MAX_POLL_BACKOFF_MS = 10_000;

export interface PollerOptions {
  /** Normal delay between polls, in ms (API.md §3: 1.5 s stage, 2 s admin). */
  readonly intervalMs: number;
  /**
   * One poll. Resolve to keep polling at the normal pace; reject to back off ×2 up to 10 s.
   * Resolve `false` to stop the poller (the session ended).
   */
  readonly run: () => Promise<boolean | void>;
  /** Called after each failure with the consecutive failure count (0 after a success). */
  readonly onFailures?: (failures: number) => void;
}

/**
 * A self-scheduling poll loop: never two polls at once, never faster than `intervalMs`, backoff ×2
 * up to 10 s after failures and back to normal after a success (API.md §3). `now()` asks for a poll
 * as soon as the interval allows (after an action, or when the device comes back online).
 *
 * Unlike the player's poller it never pauses for a hidden tab: the stage must keep up while the
 * projector's browser is in the background, and the admin needs alerts.
 */
export class Poller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private again = false;
  private stopped = true;
  private failures = 0;
  private lastStart = -Infinity;

  constructor(private readonly options: PollerOptions) {}

  /** Starts polling (immediately). Calling it while running only asks for a poll. */
  start(): void {
    this.stopped = false;
    this.now();
  }

  stop(): void {
    this.stopped = true;
    this.again = false;
    this.clear();
  }

  /** Polls as soon as allowed; keeps the backoff count. */
  now(): void {
    if (this.stopped) {
      return;
    }
    if (this.running) {
      this.again = true;
      return;
    }
    const wait = this.lastStart + this.options.intervalMs - Date.now();
    if (wait > 0) {
      this.schedule(wait);
      return;
    }
    void this.tick();
  }

  private async tick(): Promise<void> {
    this.clear();
    this.running = true;
    this.lastStart = Date.now();
    let next = this.options.intervalMs;
    try {
      const keepGoing = await this.options.run();
      if (keepGoing === false) {
        this.stopped = true;
      }
      if (this.failures !== 0) {
        this.failures = 0;
        this.options.onFailures?.(0);
      }
    } catch {
      this.failures++;
      this.options.onFailures?.(this.failures);
      next = Math.min(MAX_POLL_BACKOFF_MS, this.options.intervalMs * 2 ** this.failures);
    } finally {
      this.running = false;
    }
    if (this.stopped) {
      return;
    }
    const again = this.again;
    this.again = false;
    if (again) {
      this.now();
    } else {
      this.schedule(next);
    }
  }

  private schedule(delay: number): void {
    this.clear();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.now();
    }, delay);
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
