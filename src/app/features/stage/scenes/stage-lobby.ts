import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiUrlPipe } from '../../../core/api/api-url.pipe';
import { StageState } from '../../../core/api/api.models';

/** Newest nicknames shown; the counter carries the total (a projector can't show 50 names at 36 px). */
export const LOBBY_NAMES_SHOWN = 12;

/** The join URL without the scheme, as people type it. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** Lobby (SPEC §10.5): city name, big QR, short URL, joined counter, nicknames appearing. */
@Component({
  selector: 'pb-stage-lobby',
  imports: [ApiUrlPipe, TranslocoPipe],
  template: `
    <div class="stage-fit qr-cell">
      <img
        class="qr"
        [src]="state().qrUrl | apiUrl"
        [alt]="'stage.lobby.qrAlt' | transloco: { city: state().city.name }"
        width="1024"
        height="1024"
        fetchpriority="high"
      />
    </div>
    <div class="info">
      <h2 class="stage-title">{{ 'stage.lobby.title' | transloco }}</h2>
      <div class="join">
        <p class="stage-text">{{ 'stage.lobby.how' | transloco }}</p>
        <p class="url">{{ url() }}</p>
      </div>
      <p class="count">
        <span class="stage-hero">{{ state().playersCount }}</span>
        <span class="stage-text">{{ 'stage.lobby.joined' | transloco }}</span>
      </p>
      @if (names().length > 0) {
        <ul class="names" [attr.aria-label]="'stage.lobby.namesLabel' | transloco">
          @for (name of names(); track $index) {
            <li class="name" [class.newest]="$first">{{ name }}</li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    @layer components {
      :host {
        display: grid;
        grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
        gap: clamp(var(--space-6), 3vw, var(--space-12));
        min-block-size: 0;
      }

      .qr {
        inline-size: min(100cqi, 100cqb);
        block-size: auto;
        aspect-ratio: 1;
        padding: clamp(0.75rem, 2cqi, 2rem);
        border-radius: var(--radius-md);
        background-color: var(--color-qr-bg);
        image-rendering: pixelated;
      }

      .info {
        display: grid;
        align-content: safe center;
        gap: clamp(var(--space-3), 2.5vh, var(--space-8));
        min-block-size: 0;
        overflow: clip;
      }

      .join {
        display: grid;
        gap: var(--space-1);
      }

      .url {
        margin: 0;
        font-family: var(--font-mono);
        font-size-adjust: from-font;
        font-size: var(--text-xl);
        font-weight: 700;
        color: var(--syntax-keyword);
        overflow-wrap: anywhere;
      }

      .count {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0 var(--space-4);
        margin: 0;
      }

      .count .stage-hero {
        font-size: clamp(var(--text-xl), 12vh, 10rem);
        color: var(--syntax-number);
      }

      .names {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2) var(--space-3);
        max-block-size: 24vh;
        margin: 0;
        padding: 0;
        overflow: clip;
        list-style: none;
        /* The list is a glimpse of who joined; the fade says there are more (the counter has all). */
        mask-image: linear-gradient(to bottom, black 70%, transparent);
      }

      .name {
        padding: var(--space-1) var(--space-3);
        border: var(--border-width) solid var(--color-border-strong);
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
        font-size: var(--text-xl);
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .name.newest {
        border-color: var(--color-accent);
        color: var(--syntax-keyword);
      }

      @media (prefers-reduced-motion: no-preference) {
        .name.newest {
          animation: pb-pop-in var(--duration-slow) var(--ease-out);
        }
      }

      @keyframes pb-pop-in {
        from {
          opacity: 0;
          scale: 0.85;
        }
      }
    }
  `,
})
export class StageLobby {
  readonly state = input.required<StageState>();

  protected readonly url = computed(() => shortUrl(this.state().joinUrl));
  /** Newest first. */
  protected readonly names = computed(() =>
    [...(this.state().nicknames ?? [])].reverse().slice(0, LOBBY_NAMES_SHOWN),
  );
}
