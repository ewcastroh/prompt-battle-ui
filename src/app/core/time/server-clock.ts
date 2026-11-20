/**
 * Server clock offset and countdown math (API.md §3, D-020 #10).
 *
 * Countdowns use the absolute `endsAt` and the server's `Date` header: remaining = endsAt − (local
 * now + offset), with offset = server clock − local clock. `Date` has one-second resolution, so each
 * response only bounds the offset. The server stamped second D at some instant between sending and
 * receiving, which gives:
 *
 *   D − receivedAt  ≤  offset  <  D + 1000 − sentAt
 *
 * Intersecting the bounds of recent responses narrows the estimate to a few tens of milliseconds
 * after a dozen polls. If the bounds stop overlapping (the phone's clock was changed), only the
 * newest response is kept.
 */

/** One response's clock evidence, all in epoch ms. */
export interface ClockSample {
  /** The `Date` header value (whole seconds). */
  readonly serverDate: number;
  /** Local time when the request was sent. */
  readonly sentAt: number;
  /** Local time when the response arrived. */
  readonly receivedAt: number;
}

/** Resolution of the HTTP `Date` header. */
const DATE_RESOLUTION_MS = 1000;
/** Samples kept: about 30 s of polling, so slow clock drift ages out. */
const MAX_SAMPLES = 20;

export interface OffsetBounds {
  readonly low: number;
  readonly high: number;
}

/** The offset interval one sample allows. */
export function sampleBounds(sample: ClockSample): OffsetBounds {
  return {
    low: sample.serverDate - sample.receivedAt,
    high: sample.serverDate + DATE_RESOLUTION_MS - sample.sentAt,
  };
}

/** Intersection of the samples' intervals, or `null` when they don't overlap. */
export function intersectBounds(samples: readonly ClockSample[]): OffsetBounds | null {
  let low = -Infinity;
  let high = Infinity;
  for (const sample of samples) {
    const bounds = sampleBounds(sample);
    low = Math.max(low, bounds.low);
    high = Math.min(high, bounds.high);
  }
  return samples.length > 0 && low <= high ? { low, high } : null;
}

/** Running estimate of server time − local time. */
export class ServerClock {
  private samples: ClockSample[] = [];
  private estimate = 0;

  /** Offset in ms to add to the local clock to get server time. 0 until the first sample. */
  get offset(): number {
    return this.estimate;
  }

  /** Adds a response's evidence and returns the new estimate. Invalid samples are ignored. */
  add(sample: ClockSample): number {
    if (
      !Number.isFinite(sample.serverDate) ||
      !Number.isFinite(sample.sentAt) ||
      !(sample.receivedAt >= sample.sentAt)
    ) {
      return this.estimate;
    }
    this.samples = [...this.samples, sample].slice(-MAX_SAMPLES);
    let bounds = intersectBounds(this.samples);
    if (!bounds) {
      this.samples = [sample];
      bounds = sampleBounds(sample);
    }
    this.estimate = Math.round((bounds.low + bounds.high) / 2);
    return this.estimate;
  }

  reset(): void {
    this.samples = [];
    this.estimate = 0;
  }
}

/** Milliseconds left until `endsAt` on the server clock, never negative. `NaN` input → 0. */
export function remainingMs(endsAt: string, localNow: number, offset: number): number {
  const end = Date.parse(endsAt);
  if (Number.isNaN(end)) {
    return 0;
  }
  return Math.max(0, end - (localNow + offset));
}

/** Whole seconds shown for a remaining time: rounds up, so "0:00" appears only at the end. */
export function remainingSeconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** `m:ss` (minutes unpadded, as a stopwatch): 0:09, 4:05, 29:59. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** Delay until the displayed second changes, so ticks land on second boundaries. */
export function msUntilNextSecond(ms: number): number {
  if (ms <= 0) {
    return 1000;
  }
  const fraction = ms % 1000;
  // +5 ms so the tick lands just after the boundary, never just before it.
  return (fraction === 0 ? 1000 : fraction) + 5;
}

/** Parses an HTTP-date (`Wed, 02 Dec 2026 15:04:05 GMT`) to epoch ms, or `null`. */
export function parseHttpDate(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
