import { Component, DestroyRef, Service, inject, signal } from '@angular/core';

/** How long an announcement stays in the region before it is cleared (so it isn't found later). */
const CLEAR_AFTER_MS = 8000;

/**
 * The page's one polite live region (modern-web-guidance `accessibility`: "a single `polite` region
 * per page"), rendered once by {@link LiveAnnouncer} in the app root so it exists before any message.
 *
 * - Every update clears the region first, so the same text can be announced twice in a row.
 * - While a modal dialog is open the page behind it is inert and its live regions go unheard, so
 *   announcements wait and the latest one plays when the dialog closes.
 */
@Service()
export class Announcer {
  private readonly text = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private openModals = 0;
  private queued: string | null = null;

  /** Current text of the polite region. */
  readonly message = this.text.asReadonly();

  /**
   * Announces `text` politely after `delayMs`, so it doesn't talk over speech caused by a focus move
   * or typing. A newer announcement replaces a pending one.
   */
  announce(text: string, delayMs = 200): void {
    if (!text) {
      return;
    }
    if (this.openModals > 0) {
      this.queued = text;
      return;
    }
    this.cancelPending();
    this.text.set('');
    this.timer = setTimeout(() => {
      this.timer = null;
      this.text.set(text);
      this.clearTimer = setTimeout(() => this.text.set(''), CLEAR_AFTER_MS);
    }, delayMs);
  }

  /** Cancels a pending announcement and empties the region. */
  clear(): void {
    this.cancelPending();
    this.queued = null;
    this.text.set('');
  }

  /** A modal dialog opened: hold announcements until it closes. */
  modalOpened(): void {
    this.openModals++;
  }

  /** A modal dialog closed: play the latest held announcement, if any. */
  modalClosed(): void {
    this.openModals = Math.max(0, this.openModals - 1);
    if (this.openModals === 0 && this.queued) {
      const text = this.queued;
      this.queued = null;
      // After the browser has returned focus to the dialog's invoker.
      this.announce(text, 600);
    }
  }

  private cancelPending(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.clearTimer !== null) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
  }
}

/** Renders the {@link Announcer} region. Place it once, in the app root. */
@Component({
  selector: 'pb-live-announcer',
  template: `<div class="visually-hidden" aria-live="polite" aria-atomic="true">
    {{ announcer.message() }}
  </div>`,
})
export class LiveAnnouncer {
  protected readonly announcer = inject(Announcer);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.announcer.clear());
  }
}
