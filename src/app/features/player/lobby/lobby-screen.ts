import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Me } from '../../../core/api/api.models';
import { Icon } from '../../../shared/icon/icon';

/**
 * Lobby (SPEC §10.4): "Hi, {nickname}" is the header title; this shows the claim code and
 * "Wait for the round to start". The screen updates by itself when the admin starts a round.
 */
@Component({
  selector: 'pb-lobby-screen',
  imports: [Icon, TranslocoPipe],
  template: `
    <section class="window">
      <p class="window-bar">~/{{ me().player.city }}/{{ 'player.lobby.file' | transloco }}</p>
      <div class="window-body">
        <div class="claim">
          <p class="claim-label">
            <pb-icon name="ticket" />
            <span>{{ 'player.lobby.claimLabel' | transloco }}</span>
          </p>
          <p class="claim-code mono">{{ me().player.claimCode }}</p>
          <p class="hint">{{ 'player.lobby.claimHint' | transloco }}</p>
        </div>
        <p class="wait">
          <pb-icon name="hourglass" />
          <span>{{ 'player.lobby.wait' | transloco }}</span>
        </p>
        <p class="hint">{{ 'player.lobby.waitDetail' | transloco }}</p>
      </div>
    </section>
  `,
  styles: `
    @layer components {
      .claim {
        display: grid;
        gap: var(--space-2);
        padding: var(--space-4);
        border: 2px dashed var(--color-border-strong);
        border-radius: var(--radius-md);
      }

      .claim > * {
        margin: 0;
      }

      .claim-label {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-weight: 700;
      }

      .claim-label pb-icon {
        color: var(--syntax-keyword);
      }

      .claim-code {
        font-size: clamp(2.5rem, 2rem + 4vw, 4rem);
        font-weight: 800;
        letter-spacing: 0.15em;
        line-height: 1.1;
      }

      .wait {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        font-size: var(--text-lg);
        font-weight: 700;
      }

      .wait pb-icon {
        margin-block-start: 0.2rem;
        color: var(--syntax-function);
      }

      .hint {
        color: var(--color-text-muted);
      }
    }
  `,
})
export class LobbyScreen {
  readonly me = input.required<Me>();
}
