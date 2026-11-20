import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Me } from '../../../core/api/api.models';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';
import { PlayerStateService } from '../player-state.service';
import { AttemptCard } from '../round/attempt-card';
import { GenerationStatus } from '../round/generation-status';

/**
 * Round closed (SPEC §10.4): "Round closed! The AI is scoring…" (the heading is in the header).
 * Shows the entry that will be scored. A generation that was already running may still finish within
 * the grace period, so its status stays visible. Practice rounds are not scored.
 */
@Component({
  selector: 'pb-round-closed-screen',
  imports: [AttemptCard, GenerationStatus, Icon, Spinner, TranslocoPipe],
  template: `
    <section class="window">
      <p class="window-bar">~/{{ me().player.city }}/{{ 'player.closed.file' | transloco }}</p>
      <div class="window-body">
        @if (scored()) {
          <div class="scoring">
            <pb-spinner labelledBy="closed-scoring" />
            <p id="closed-scoring" class="lead">{{ 'player.closed.scoring' | transloco }}</p>
          </div>
        } @else {
          <p class="lead">
            <pb-icon name="info" />
            <span>{{ 'player.closed.practice' | transloco }}</span>
          </p>
        }
        @if (generation(); as live) {
          <pb-generation-status [generation]="live" [latestNumber]="attempts().length" />
          <p class="hint">{{ 'player.closed.grace' | transloco }}</p>
        }
      </div>
    </section>

    @if (scored()) {
      <section class="entry">
        <h2>{{ 'player.closed.entryHeading' | transloco }}</h2>
        @if (entry(); as attempt) {
          <div class="entry-card">
            <pb-attempt-card [attempt]="attempt" [number]="entryNumber()" [selected]="true" />
          </div>
        } @else {
          <p class="hint">{{ 'player.closed.noEntry' | transloco }}</p>
        }
      </section>
    }
  `,
  styles: `
    @layer components {
      :host {
        display: grid;
        gap: var(--space-6);
      }

      .scoring {
        display: flex;
        align-items: center;
        gap: var(--space-4);
      }

      .lead {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        margin: 0;
        font-size: var(--text-lg);
        font-weight: 700;
      }

      .lead pb-icon {
        margin-block-start: 0.2rem;
        color: var(--syntax-function);
      }

      .hint {
        margin: 0;
        color: var(--color-text-muted);
      }

      /* Inside the window the status line is flat: no box inside a box (DESIGN.md §1). */
      pb-generation-status {
        padding: 0;
        border: 0;
        background: none;
      }

      .entry {
        display: grid;
        gap: var(--space-3);
      }

      .entry h2 {
        margin: 0;
      }

      .entry-card {
        max-inline-size: 16rem;
      }
    }
  `,
})
export class RoundClosedScreen {
  private readonly state = inject(PlayerStateService);

  readonly me = input.required<Me>();

  protected readonly scored = computed(() => this.me().round?.scored ?? true);
  protected readonly attempts = computed(() => this.me().attempts);
  protected readonly generation = this.state.generation;
  protected readonly entry = computed(() => {
    const id = this.me().round?.entryAttemptId;
    return this.attempts().find((attempt) => attempt.id === id) ?? null;
  });
  protected readonly entryNumber = computed(() => {
    const entry = this.entry();
    return entry ? this.attempts().indexOf(entry) + 1 : 0;
  });
}
