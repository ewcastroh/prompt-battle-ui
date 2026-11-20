import { Component, DOCUMENT, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import type { CreateTypes } from 'canvas-confetti';

/** Theme tokens the pieces take their colors from (DESIGN.md §3 syntax accents). */
const COLOR_TOKENS = [
  '--color-accent',
  '--color-success',
  '--color-warning',
  '--color-info',
  '--color-danger',
];

/** One burst: three volleys from both lower corners, about 3 s in all (under WCAG 2.2.2's 5 s). */
const VOLLEYS_MS = [0, 350, 700];

/**
 * Confetti for the #1 reveal (SPEC §10.5, DESIGN.md §7; canvas-confetti 1.9.4, ISC, bundled).
 *
 * Motion is opt-in (DESIGN.md §8): `fire()` does nothing unless `prefers-reduced-motion:
 * no-preference` matches, and the library's own `disableForReducedMotion` guard is on too. With
 * reduced motion the reveal keeps its static celebration (trophy and frame), so nothing is lost.
 * The library loads on the first burst only. The canvas is decorative, never blocks the pointer,
 * and is not in the accessibility tree.
 */
@Component({
  selector: 'pb-confetti-burst',
  template: `<canvas #canvas class="canvas" aria-hidden="true"></canvas>`,
  styles: `
    @layer components {
      .canvas {
        position: fixed;
        inset: 0;
        z-index: 2;
        inline-size: 100%;
        block-size: 100%;
        pointer-events: none;
      }
    }
  `,
})
export class ConfettiBurst {
  private readonly document = inject(DOCUMENT);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private instance: CreateTypes | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.timers.forEach(clearTimeout);
      this.instance?.reset();
    });
  }

  /** Fires one burst; true if it ran (motion allowed and the page visible). */
  async fire(): Promise<boolean> {
    const window = this.document.defaultView;
    const allowed =
      window?.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? false;
    if (!allowed || this.document.hidden) {
      return false;
    }
    const { create } = await import('canvas-confetti');
    if (this.destroyed) {
      return false;
    }
    this.instance ??= create(this.canvas().nativeElement, {
      resize: true,
      useWorker: true,
      disableForReducedMotion: true,
    });
    const colors = this.colors();
    const shoot = this.instance;
    for (const delay of VOLLEYS_MS) {
      this.timers.push(
        setTimeout(() => {
          for (const x of [0.1, 0.9]) {
            void shoot({
              particleCount: 70,
              angle: x < 0.5 ? 60 : 120,
              spread: 70,
              startVelocity: 60,
              ticks: 260,
              origin: { x, y: 0.95 },
              colors,
              disableForReducedMotion: true,
            });
          }
        }, delay),
      );
    }
    return true;
  }

  /** Resolves the theme tokens to concrete colors (canvas needs rgb, not `light-dark()`). */
  private colors(): string[] {
    const probe = this.document.createElement('span');
    probe.hidden = true;
    this.document.body.append(probe);
    const view = this.document.defaultView!;
    const colors = COLOR_TOKENS.map((token) => {
      probe.style.color = `var(${token})`;
      return view.getComputedStyle(probe).color;
    });
    probe.remove();
    return colors.map((color) => rgbToHex(color)).filter((hex): hex is string => hex !== null);
  }
}

/** `rgb(91, 43, 217)` → `#5b2bd9` (canvas-confetti parses hex colors only). */
export function rgbToHex(color: string): string | null {
  const match = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(color);
  if (!match) {
    return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
  }
  return `#${match
    .slice(1, 4)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`;
}
