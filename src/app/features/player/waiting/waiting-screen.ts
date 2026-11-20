import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Me, Phase } from '../../../core/api/api.models';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';

/** Message key per phase while results play on the stage (players never see per-round scores). */
export function waitingMessageKey(phase: Phase): string {
  switch (phase) {
    case 'MINI_PODIUM':
      return 'player.waiting.mini';
    case 'FINAL_SCORING':
      return 'player.waiting.finalScoring';
    case 'PODIUM_REVEAL':
    case 'FINISHED':
      return 'player.waiting.podium';
    default:
      return 'player.waiting.scored';
  }
}

/**
 * Between rounds and during the reveals: the results happen on the projector, so the phone points
 * there. The final podium shows the player's own result here once rank #1 is revealed.
 */
@Component({
  selector: 'pb-waiting-screen',
  imports: [Icon, Spinner, TranslocoPipe],
  template: `
    <section class="window">
      <p class="window-bar">~/{{ me().player.city }}/{{ 'player.waiting.file' | transloco }}</p>
      <div class="window-body">
        <div class="message">
          @if (preparing()) {
            <pb-spinner labelledBy="waiting-message" />
          } @else {
            <pb-icon class="icon" name="monitor" />
          }
          <p id="waiting-message" class="lead">
            {{ messageKey() | transloco: { city: me().player.cityName } }}
          </p>
        </div>
        <p class="hint">{{ 'player.waiting.stayHere' | transloco }}</p>
      </div>
    </section>
  `,
  styles: `
    @layer components {
      .message {
        display: flex;
        align-items: flex-start;
        gap: var(--space-4);
      }

      .icon {
        --icon-size: 2.5rem;
        color: var(--syntax-function);
      }

      .lead {
        margin: 0;
        font-size: var(--text-lg);
        font-weight: 700;
      }

      .hint {
        color: var(--color-text-muted);
      }
    }
  `,
})
export class WaitingScreen {
  readonly me = input.required<Me>();

  protected readonly messageKey = computed(() => waitingMessageKey(this.me().phase));
  protected readonly preparing = computed(() => this.me().phase === 'FINAL_SCORING');
}
