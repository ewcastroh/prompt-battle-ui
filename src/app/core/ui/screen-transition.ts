import { Injector, afterNextRender } from '@angular/core';

type TransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => {
    readonly finished: Promise<void>;
    readonly ready: Promise<void>;
  };
};

/**
 * Runs a whole-screen change (DESIGN.md §8, modern-web-guidance `same-document-transitions`):
 * `update` runs inside `document.startViewTransition()` where supported and motion is allowed, so the
 * browser cross-fades between the old and the new screen; otherwise it runs at once. `settled` runs
 * after the new screen is rendered and any transition has finished (for focus routing).
 *
 * Only for real screen changes: a document-level transition briefly blocks taps on the whole page.
 */
export function runScreenTransition(
  document: Document,
  injector: Injector,
  update: () => void,
  settled: () => void,
): void {
  const doc = document as TransitionDocument;
  const reduceMotion =
    doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (!doc.startViewTransition || reduceMotion || doc.visibilityState === 'hidden') {
    update();
    afterNextRender(settled, { injector });
    return;
  }
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        update();
        // The new snapshot is taken when this promise resolves: wait for Angular to render it.
        afterNextRender(() => resolve(), { injector });
      }),
  );
  // A newer transition skips this one and rejects `ready`; that is expected, not an error.
  transition.ready.catch(() => undefined);
  transition.finished.then(settled, settled);
}
