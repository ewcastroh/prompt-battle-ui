import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/icon/icon';
import { formatCountdown, msUntilNextSecond, remainingMs, remainingSeconds } from '../server-clock';

/** From this many seconds left, the countdown warns (DESIGN.md §7: last 60 s). */
export const LAST_MINUTE_SECONDS = 60;

/**
 * Round countdown (DESIGN.md §7): mono, tabular numbers, `endsAt` on the server clock (API.md §3).
 * The last 60 s use the warning color plus a text cue; nothing flashes. It ticks on second boundaries
 * and is not a live region (it would talk every second): `lastMinute` fires once for an announcement.
 */
@Component({
  selector: 'pb-countdown',
  imports: [Icon, TranslocoPipe],
  host: {
    '[class.warn]': 'lastMinute()',
    '[class.over]': 'seconds() === 0',
  },
  template: `
    <p class="clock" role="timer">
      <pb-icon name="timer" />
      <span class="visually-hidden">{{ 'player.round.timeLeft' | transloco }}</span>
      <span class="value">{{ display() }}</span>
    </p>
    @if (seconds() === 0) {
      <p class="cue">{{ 'player.round.timeUp' | transloco }}</p>
    } @else if (lastMinute()) {
      <p class="cue">{{ 'player.round.lastMinute' | transloco }}</p>
    }
  `,
  styles: `
    @layer components {
      :host {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0 var(--space-3);
        color: var(--color-text);
      }

      .clock {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        margin: 0;
        font-family: var(--font-mono);
        font-size-adjust: from-font;
        font-size: clamp(1.5rem, 1.1rem + 2vw, 2.25rem);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
      }

      .clock pb-icon {
        --icon-size: 0.8em;
        color: var(--syntax-function);
      }

      .cue {
        margin: 0;
        font-weight: 700;
      }

      :host(.warn) .clock,
      :host(.warn) .cue,
      :host(.warn) .clock pb-icon {
        color: var(--color-warning);
      }
    }
  `,
})
export class Countdown {
  /** ISO instant the round ends at, on the server clock. */
  readonly endsAt = input.required<string>();
  /** Server clock − local clock, in ms. */
  readonly serverOffset = input(0);
  /** Emits once when the last minute starts. */
  readonly lastMinuteStarted = output<void>();

  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setTimeout> | null = null;
  private announcedFor: string | null = null;

  protected readonly remaining = computed(() =>
    remainingMs(this.endsAt(), this.now(), this.serverOffset()),
  );
  readonly seconds = computed(() => remainingSeconds(this.remaining()));
  readonly lastMinute = computed(() => this.seconds() > 0 && this.seconds() <= LAST_MINUTE_SECONDS);
  protected readonly display = computed(() => formatCountdown(this.seconds()));

  constructor() {
    // Re-arm the ticker whenever the end time or the clock offset changes (an extension, a sync).
    effect((onCleanup) => {
      this.endsAt();
      this.serverOffset();
      // The ticker writes `now`; untracked so its own ticks don't re-run this effect.
      untracked(() => this.tick());
      onCleanup(() => this.stop());
    });
    effect(() => {
      // Fire the cue once per end time (also when the screen opens inside the last minute).
      const endsAt = this.endsAt();
      if (this.lastMinute() && this.announcedFor !== endsAt) {
        this.announcedFor = endsAt;
        this.lastMinuteStarted.emit();
      } else if (!this.lastMinute() && this.seconds() > LAST_MINUTE_SECONDS) {
        this.announcedFor = null;
      }
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private tick(): void {
    this.stop();
    this.now.set(Date.now());
    const left = this.remaining();
    if (left <= 0) {
      return;
    }
    this.timer = setTimeout(() => this.tick(), msUntilNextSecond(left));
  }

  private stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
