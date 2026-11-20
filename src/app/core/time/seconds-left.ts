import { DestroyRef, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { msUntilNextSecond, remainingMs, remainingSeconds } from './server-clock';

/**
 * Whole seconds left until `endsAt()` on the server clock (API.md §3), as a signal that ticks on
 * second boundaries and stops at 0. Re-arms when the end time or the clock offset changes (an
 * extension, a sync). `endsAt()` = `null` reads 0. Call it in an injection context.
 */
export function secondsLeft(
  endsAt: () => string | null,
  serverOffset: () => number,
): Signal<number> {
  const now = signal(Date.now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const remaining = computed(() => {
    const end = endsAt();
    return end === null ? 0 : remainingMs(end, now(), serverOffset());
  });
  const tick = () => {
    stop();
    now.set(Date.now());
    const left = remaining();
    if (left > 0) {
      timer = setTimeout(tick, msUntilNextSecond(left));
    }
  };
  effect((onCleanup) => {
    endsAt();
    serverOffset();
    untracked(tick);
    onCleanup(stop);
  });
  inject(DestroyRef).onDestroy(stop);
  return computed(() => remainingSeconds(remaining()));
}
