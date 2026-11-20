import { Component, input } from '@angular/core';

/**
 * Busy indicator (modern-web-guidance `spinner`): a native indeterminate `<progress>` drawn as a ring,
 * so assistive technologies know it is a progress indicator. Name it with `labelledBy` (the id of the
 * visible message) or `label`.
 *
 * Motion (DESIGN.md §8): static by default; it spins only with `prefers-reduced-motion:
 * no-preference`, and turns slowly (6 s) with `reduce` so the process still reads as active.
 * Only `rotate` is animated.
 */
@Component({
  selector: 'pb-spinner',
  template: `<progress
    class="loading-spinner"
    [attr.aria-labelledby]="labelledBy()"
    [attr.aria-label]="labelledBy() ? null : label()"
  ></progress>`,
  styles: `
    @layer components {
      :host {
        display: inline-flex;
        flex: none;
      }

      /* Hide the native indeterminate bars. One rule per pseudo-element: a selector list with an
         unknown vendor pseudo-element would drop the whole rule. */
      progress.loading-spinner:indeterminate::-webkit-progress-bar {
        display: none;
        background: none;
      }
      progress.loading-spinner:indeterminate::-webkit-progress-value {
        display: none;
        background: none;
      }
      progress.loading-spinner:indeterminate::-moz-progress-bar {
        display: none;
        background: none;
      }

      progress.loading-spinner:indeterminate {
        --_from: 90deg;
        --_to: 248deg;
        --size: var(--spinner-size, 2.5rem);
        --thickness: var(--spinner-thickness, 0.25rem);
        --spinner-color: var(--color-accent);
        --track-color: var(--color-border);
        inline-size: var(--size);
        block-size: var(--size);
        margin: 0;
        border: 0;
        border-radius: 50%;
        appearance: none;
        background: conic-gradient(
            from var(--_from),
            var(--spinner-color) calc(var(--_to) - var(--_from)),
            transparent 0
          )
          var(--track-color);
      }

      @supports (background-clip: border-area) {
        progress.loading-spinner:indeterminate {
          border: var(--thickness) solid transparent;
          background-clip: border-area;
          background-origin: border-box;
        }
      }

      @supports not (background-clip: border-area) {
        progress.loading-spinner:indeterminate {
          --clip-boundary: calc(100% - var(--thickness));
          mask-image: radial-gradient(
            farthest-side,
            transparent var(--clip-boundary),
            black var(--clip-boundary)
          );
        }
      }

      /* Forced colors removes gradients: draw the ring with system colors instead. */
      @media (forced-colors: active) {
        progress.loading-spinner:indeterminate {
          forced-color-adjust: none;
          --spinner-color: CanvasText;
          --track-color: Canvas;
        }
      }

      @media (prefers-reduced-motion: no-preference) {
        progress.loading-spinner:indeterminate {
          animation: pb-spin 1.5s linear infinite;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        progress.loading-spinner:indeterminate {
          animation: pb-spin 6s linear infinite;
        }
      }

      @keyframes pb-spin {
        to {
          rotate: 1turn;
        }
      }
    }
  `,
})
export class Spinner {
  /** Id of the visible text that names the wait (preferred). */
  readonly labelledBy = input<string | null>(null);
  /** Translated name when there is no visible text to point at. */
  readonly label = input<string | null>(null);
}
