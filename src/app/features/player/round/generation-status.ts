import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Attempt } from '../../../core/api/api.models';
import { Announcer } from '../../../core/ui/announcer';
import { Icon, IconName } from '../../../shared/icon/icon';
import { GenerationInFlight } from '../player-state.service';

export type StatusTone = 'idle' | 'busy' | 'done' | 'problem';

/** What the status line shows and, when the state changes, announces. */
export interface StatusLine {
  /** Identifies the state; an announcement happens only when it changes. */
  readonly state: string;
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly tone: StatusTone;
  readonly icon: IconName;
  /** Polite announcement for entering this state, or `null` (idle, queue moves). */
  readonly announceKey: string | null;
}

/**
 * Status line content (DESIGN.md §7 "Generation status"): the generation in flight, else the outcome
 * of the newest attempt, else idle. Queue position changes keep the same `state`, so moving up the
 * queue is shown but not announced every 1.5 s.
 */
export function statusLine(
  generation: GenerationInFlight | null,
  latest: Attempt | null,
  latestNumber: number,
): StatusLine {
  if (generation) {
    if (generation.status === 'GENERATING') {
      return {
        state: `${generation.attemptId}:GENERATING`,
        key: 'player.round.status.generating',
        params: {},
        tone: 'busy',
        icon: 'loader-circle',
        announceKey: 'player.round.announce.generating',
      };
    }
    const position = generation.queuePosition;
    return {
      state: `${generation.attemptId}:QUEUED`,
      key: position ? 'player.round.status.queued' : 'player.round.status.queuedWaiting',
      params: { position },
      tone: 'busy',
      icon: 'loader-circle',
      announceKey: position
        ? 'player.round.announce.queued'
        : 'player.round.announce.queuedWaiting',
    };
  }
  if (latest) {
    const params = { number: latestNumber };
    switch (latest.status) {
      case 'DONE':
        return {
          state: `${latest.id}:DONE`,
          key: 'player.round.status.done',
          params,
          tone: 'done',
          icon: 'circle-check',
          announceKey: 'player.round.announce.done',
        };
      case 'BLOCKED':
        return {
          state: `${latest.id}:BLOCKED`,
          key: 'player.round.status.blocked',
          params,
          tone: 'problem',
          icon: 'ban',
          announceKey: 'player.round.announce.blocked',
        };
      case 'FAILED': {
        const late = latest.code === 'ROUND_NOT_OPEN';
        return {
          state: `${latest.id}:FAILED`,
          key: late ? 'player.round.status.late' : 'player.round.status.failed',
          params,
          tone: 'problem',
          icon: 'triangle-alert',
          announceKey: late ? 'player.round.announce.late' : 'player.round.announce.failed',
        };
      }
      default:
        // QUEUED/GENERATING without a live generation: the next poll will catch up.
        break;
    }
  }
  return {
    state: 'idle',
    key: 'player.round.status.idle',
    params: {},
    tone: 'idle',
    icon: 'sparkles',
    announceKey: null,
  };
}

/**
 * Generation status line in mono (DESIGN.md §7): "Queued · position 4", "Compiling image…", done,
 * blocked, failed. The line itself is not a live region; meaningful state changes are announced
 * politely through the page's announcer, a moment later so they don't talk over typing.
 */
@Component({
  selector: 'pb-generation-status',
  imports: [Icon, TranslocoPipe],
  host: { '[class]': "'tone-' + line().tone" },
  template: `
    <p class="line">
      <pb-icon [name]="line().icon" />
      <span>{{ line().key | transloco: line().params }}</span>
    </p>
  `,
  styles: `
    @layer components {
      :host {
        display: block;
        padding: var(--space-2) var(--space-3);
        border: var(--border-width) solid var(--color-border);
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
        font-family: var(--font-mono);
        font-size-adjust: from-font;
        font-size: var(--text-sm);
        font-variant-numeric: tabular-nums;
      }

      .line {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        margin: 0;
        max-inline-size: none;
      }

      .line pb-icon {
        margin-block-start: 0.125rem;
      }

      :host(.tone-idle) {
        color: var(--color-text-muted);
      }
      :host(.tone-busy) {
        color: var(--color-text);
      }
      :host(.tone-busy) pb-icon {
        color: var(--syntax-function);
      }
      :host(.tone-done) {
        border-color: var(--color-success);
        color: var(--color-success);
      }
      :host(.tone-problem) {
        border-color: var(--color-danger);
        color: var(--color-danger);
      }
    }
  `,
})
export class GenerationStatus {
  private readonly announcer = inject(Announcer);
  private readonly transloco = inject(TranslocoService);

  readonly generation = input<GenerationInFlight | null>(null);
  /** The newest attempt of the round, if any. */
  readonly latest = input<Attempt | null>(null);
  /** Its 1-based number in the gallery. */
  readonly latestNumber = input(0);

  protected readonly line = computed(() =>
    statusLine(this.generation(), this.latest(), this.latestNumber()),
  );

  constructor() {
    let previous: string | null = null;
    effect(() => {
      const line = this.line();
      if (previous !== null && line.state !== previous && line.announceKey) {
        const key = line.announceKey;
        untracked(() => this.announcer.announce(this.transloco.translate(key, line.params), 700));
      }
      previous = line.state;
    });
  }
}
