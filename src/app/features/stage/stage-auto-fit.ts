import {
  DOCUMENT,
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  inject,
} from '@angular/core';

/** Fit factor steps: 36 px → 24 px is 1 → 0.667 (DESIGN.md §6 exception, D-026). */
const STEP = 0.06;
const MIN_FIT = 0.66;

/**
 * Keeps a stage scene on one screen (D-026). User text on the stage (prompts, commentary, round
 * names, nicknames, hidden prompts) is sized with `--stage-fit` and never below 1.5rem (styles/
 * stage.css `.fit-text`, `.fit-title`). When the scene would overflow its box, this lowers
 * `--stage-fit` step by step until it fits or the floor is reached (cells whose overflow would stay
 * inside the scene are marked `.fit-watch`); demo-length content never
 * shrinks. It re-checks whenever the scene's content or the window size changes.
 *
 * The whole measure-and-adjust loop runs in one task, so nothing paints in between.
 */
@Directive({ selector: '[pbStageAutoFit]' })
export class StageAutoFit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly window = inject(DOCUMENT).defaultView;
  private frame: number | null = null;

  constructor() {
    afterNextRender(() => {
      const schedule = () => this.schedule();
      const mutations = new MutationObserver(schedule);
      mutations.observe(this.host, { childList: true, subtree: true, characterData: true });
      const resize = new ResizeObserver(schedule);
      resize.observe(this.host);
      // Images and fonts change sizes after they load.
      this.host.addEventListener('load', schedule, true);
      this.window?.document.fonts?.addEventListener('loadingdone', schedule);
      this.fit();
      this.cleanup = () => {
        mutations.disconnect();
        resize.disconnect();
        this.host.removeEventListener('load', schedule, true);
        this.window?.document.fonts?.removeEventListener('loadingdone', schedule);
      };
    });
    inject(DestroyRef).onDestroy(() => {
      this.cleanup?.();
      if (this.frame !== null) {
        this.window?.cancelAnimationFrame(this.frame);
      }
    });
  }

  private cleanup: (() => void) | null = null;

  private schedule(): void {
    if (this.frame !== null || !this.window) {
      return;
    }
    this.frame = this.window.requestAnimationFrame(() => {
      this.frame = null;
      this.fit();
    });
  }

  /** Largest factor (≤ 1) at which the scene fits, or the floor. */
  fit(): void {
    const style = this.host.style;
    let fit = 1;
    style.setProperty('--stage-fit', '1');
    while (this.overflows() && fit > MIN_FIT) {
      fit = Math.max(MIN_FIT, Math.round((fit - STEP) * 100) / 100);
      style.setProperty('--stage-fit', String(fit));
    }
    this.host.dataset['fit'] = String(fit);
  }

  /** The scene box, or a cell marked `.fit-watch` (its overflow stays inside the scene). */
  private overflows(): boolean {
    const cells = [this.host, ...this.host.querySelectorAll<HTMLElement>('.fit-watch')];
    return cells.some((cell) => cell.scrollHeight > cell.clientHeight + 1);
  }
}
