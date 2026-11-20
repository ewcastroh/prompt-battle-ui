import { AppConfig } from '../app/core/config/app-config';

/** `<img src>` paths resolve against this base in tests (no `config.json` load). */
export const TEST_API_BASE = 'http://api.test';

export const testAppConfig = { provide: AppConfig, useValue: { apiBaseUrl: TEST_API_BASE } };

/** jsdom has no modal dialogs: a minimal `showModal`/`close` that toggles `open` and fires `close`. */
export function stubDialogs(): void {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal: () => void;
    close: (value?: string) => void;
  };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement) {
    if (this.hasAttribute('open')) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    }
  };
}

/** Answers `matchMedia` queries: `reduce` makes `prefers-reduced-motion: reduce` match. */
export function stubMotion(preference: 'reduce' | 'no-preference'): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes(`prefers-reduced-motion: ${preference}`),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
