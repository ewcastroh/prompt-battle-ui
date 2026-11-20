import { Component, computed, input, output, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Attempt } from '../../../core/api/api.models';
import { ApiUrlPipe } from '../../../core/api/api-url.pipe';
import { ErrorMessage } from '../../../core/api/error-messages';
import { Icon, IconName } from '../../../shared/icon/icon';
import { ImageDialog } from '../../../shared/image-dialog/image-dialog';
import { ImageRetry } from '../../../shared/image-retry/image-retry';
import { InlineMessage } from '../../../shared/inline-message/inline-message';

/** How a card presents an attempt (pure, so every state is unit-tested). */
export interface AttemptView {
  readonly statusKey: string;
  readonly statusParams: Readonly<Record<string, unknown>>;
  readonly icon: IconName;
  readonly tone: 'busy' | 'done' | 'problem';
  /** Explanation under the status for blocked and failed attempts. */
  readonly messageKey: string | null;
  /** The card has (or will have) an image area. */
  readonly media: 'image' | 'placeholder' | 'none';
}

export function attemptView(attempt: Attempt): AttemptView {
  switch (attempt.status) {
    case 'QUEUED':
      return {
        statusKey: attempt.queuePosition
          ? 'player.round.attempt.status.queued'
          : 'player.round.attempt.status.queuedWaiting',
        statusParams: { position: attempt.queuePosition },
        icon: 'loader-circle',
        tone: 'busy',
        messageKey: null,
        media: 'placeholder',
      };
    case 'GENERATING':
      return {
        statusKey: 'player.round.attempt.status.generating',
        statusParams: {},
        icon: 'loader-circle',
        tone: 'busy',
        messageKey: null,
        media: 'placeholder',
      };
    case 'DONE':
      return {
        statusKey: 'player.round.attempt.status.done',
        statusParams: {},
        icon: 'circle-check',
        tone: 'done',
        messageKey: null,
        media: attempt.thumbUrl ? 'image' : 'none',
      };
    case 'BLOCKED':
      return {
        statusKey: 'player.round.attempt.status.blocked',
        statusParams: {},
        icon: 'ban',
        tone: 'problem',
        messageKey: 'errors.PROMPT_BLOCKED',
        media: 'none',
      };
    case 'FAILED': {
      const late = attempt.code === 'ROUND_NOT_OPEN';
      return {
        statusKey: late ? 'player.round.attempt.status.late' : 'player.round.attempt.status.failed',
        statusParams: {},
        icon: 'triangle-alert',
        tone: 'problem',
        messageKey: late ? 'player.round.attempt.lateMessage' : 'errors.GENERATION_FAILED',
        media: 'none',
      };
    }
  }
}

/**
 * One attempt in the gallery (DESIGN.md §7 "Attempt card"; modern-web-guidance `card`): thumbnail,
 * status and "Submit this one". The selected card gets a check + "Selected" and a strong border that
 * changes color and outline only, so nothing around it moves.
 *
 * The thumbnail opens the 1024 px image with the full prompt (cards clamp it to three lines).
 * Blocked and failed attempts have no image area and show their whole prompt.
 */
@Component({
  selector: 'pb-attempt-card',
  imports: [ApiUrlPipe, Icon, ImageDialog, ImageRetry, InlineMessage, TranslocoPipe],
  templateUrl: './attempt-card.html',
  styleUrl: './attempt-card.css',
})
export class AttemptCard {
  readonly attempt = input.required<Attempt>();
  /** 1-based position in the gallery ("Attempt 2"). */
  readonly number = input.required<number>();
  readonly selected = input(false);
  /** The round is open, so a finished attempt can become the entry. */
  readonly selectable = input(false);
  /** Error of the last selection request on this card. */
  readonly error = input<ErrorMessage | null>(null);
  readonly selectRequested = output<void>();
  readonly errorDismissed = output<void>();

  protected readonly view = computed(() => attemptView(this.attempt()));
  protected readonly dialog = viewChild(ImageDialog);
  protected readonly showSubmit = computed(
    () => this.selectable() && this.attempt().status === 'DONE',
  );

  protected openImage(): void {
    this.dialog()?.open();
  }

  protected onSubmit(): void {
    // aria-disabled while selected: activation does nothing.
    if (!this.selected()) {
      this.selectRequested.emit();
    }
  }
}
