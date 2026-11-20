import {
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';

/** DESIGN.md §8 `--duration-score`. */
export const SCORE_COUNT_MS = 1500;

/** Ease-out cubic: fast start, gentle landing on the final value. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

/** Score with one decimal in the active locale ("71,4" in es-CO, "71.4" in en). */
export function formatScore(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * A score counting up from 0 over ~1.5 s (SPEC §10.5, DESIGN.md §7 "Stage podium step").
 *
 * Motion is opt-in (DESIGN.md §8): the count runs only with `prefers-reduced-motion: no-preference`;
 * otherwise, and when the tab is hidden, the final value shows at once. The animated digits are
 * `aria-hidden`; assistive technology reads only the final value. `finished` fires once per value
 * and key (two podium steps can tie), when the final number is on screen.
 */
@Component({
  selector: 'pb-score-count-up',
  template: `<span class="digits" aria-hidden="true">{{ shown() }}</span
    ><span class="visually-hidden">{{ final() }}</span>`,
  styles: `
    @layer components {
      :host {
        font-family: var(--font-mono);
        font-size-adjust: from-font;
        font-variant-numeric: tabular-nums;
      }
    }
  `,
})
export class ScoreCountUp {
  private readonly document = inject(DOCUMENT);
  private readonly language = inject(LanguageService);

  readonly value = input.required<number>();
  /** Identity of what is counted (a reveal step): a new key counts again, even to the same value. */
  readonly key = input<unknown>(null);
  readonly finished = output<void>();

  private readonly current = signal(0);
  private frame: number | null = null;

  private readonly locale = computed(() => {
    this.language.language();
    return this.language.localeTag();
  });
  protected readonly shown = computed(() => formatScore(this.current(), this.locale()));
  protected readonly final = computed(() => formatScore(this.value(), this.locale()));

  constructor() {
    effect(() => {
      const target = this.value();
      this.key();
      untracked(() => this.animateTo(target));
    });
    inject(DestroyRef).onDestroy(() => this.cancel());
  }

  private animateTo(target: number): void {
    this.cancel();
    const window = this.document.defaultView;
    const motionAllowed =
      window?.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? false;
    if (!motionAllowed || !window?.requestAnimationFrame || this.document.hidden || target <= 0) {
      this.current.set(target);
      this.finished.emit();
      return;
    }
    const start = window.performance.now();
    this.current.set(0);
    const step = (now: number) => {
      const t = (now - start) / SCORE_COUNT_MS;
      if (t >= 1) {
        this.frame = null;
        this.current.set(target);
        this.finished.emit();
        return;
      }
      // Whole tenths only, so the digits never show more precision than the score has.
      this.current.set(Math.round(target * easeOutCubic(t) * 10) / 10);
      this.frame = window.requestAnimationFrame(step);
    };
    this.frame = window.requestAnimationFrame(step);
  }

  private cancel(): void {
    if (this.frame !== null) {
      this.document.defaultView?.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }
}
