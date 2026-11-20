import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/** Retries after a failed load, then gives up (the `alt` text stays visible). */
export const IMAGE_RETRY_DELAYS_MS: readonly number[] = [2000, 4000, 8000];

/**
 * Reloads an `<img>` that failed to load (venue Wi-Fi, slow mobile data): polling never re-renders
 * an unchanged image, so without this a dropped thumbnail or target would stay broken for the whole
 * round. Each retry re-sets `src` (and `srcset`) with a `#retry-N` fragment, which makes the browser
 * fetch again without changing what the server sees. `data:` URLs never fail and are left alone.
 */
@Directive({
  selector: 'img[pbImageRetry]',
  host: {
    '(error)': 'onError()',
    '(load)': 'retries = 0',
  },
})
export class ImageRetry {
  private readonly image = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  protected retries = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.timer !== null) {
        clearTimeout(this.timer);
      }
    });
  }

  protected onError(): void {
    const delay = IMAGE_RETRY_DELAYS_MS[this.retries];
    if (delay === undefined || this.image.currentSrc.startsWith('data:') || this.timer !== null) {
      return;
    }
    this.retries++;
    const attempt = this.retries;
    this.timer = setTimeout(() => {
      this.timer = null;
      const srcset = this.image.getAttribute('srcset');
      if (srcset && !srcset.includes('data:')) {
        this.image.setAttribute('srcset', withRetryFragment(srcset, attempt, true));
      }
      const src = this.image.getAttribute('src');
      if (src) {
        this.image.setAttribute('src', withRetryFragment(src, attempt, false));
      }
    }, delay);
  }
}

/** Adds (or replaces) a `#retry-N` fragment on a URL, or on every URL of a `srcset`. */
export function withRetryFragment(value: string, attempt: number, isSrcset: boolean): string {
  const tag = (url: string) =>
    url.startsWith('data:') ? url : `${url.split('#')[0]}#retry-${attempt}`;
  if (!isSrcset) {
    return tag(value);
  }
  return value
    .split(',')
    .map((candidate) => {
      const [url, ...descriptors] = candidate.trim().split(/\s+/);
      return [tag(url), ...descriptors].join(' ');
    })
    .join(', ');
}
