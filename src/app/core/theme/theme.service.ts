import { DOCUMENT, DestroyRef, Service, computed, inject, signal } from '@angular/core';

export type ColorScheme = 'light' | 'dark';

/** localStorage key read by the inline script in index.html. Keep both in sync. */
export const THEME_STORAGE_KEY = 'color-scheme';
const SYSTEM_CONTENT = 'light dark';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function isColorScheme(value: unknown): value is ColorScheme {
  return value === 'light' || value === 'dark';
}

/**
 * Two-state theme toggle (DESIGN.md §2.4, modern-web-guidance `dark-mode-toggle`).
 *
 * - States: *system* (nothing stored, meta `light dark`) and *override* (stored `light` or `dark`).
 * - Toggle: target = opposite of what is rendered now. If the target equals the system preference,
 *   the stored value is removed; otherwise it is stored.
 * - A stored value is never removed because the system preference later matches it.
 * - Stays in sync across tabs (`storage` event) and with the OS (`matchMedia` `change` event).
 *
 * The `<meta name="color-scheme">` content is the single source the CSS reads; the inline script in
 * index.html applies the stored value before first paint.
 */
@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly media = this.window?.matchMedia?.(DARK_QUERY) ?? null;

  private readonly stored = signal<ColorScheme | null>(this.readStored());
  private readonly systemDark = signal<boolean>(this.media?.matches ?? false);

  /** The stored override, or `null` when following the system. */
  readonly override = this.stored.asReadonly();
  /** The system preference right now. */
  readonly system = computed<ColorScheme>(() => (this.systemDark() ? 'dark' : 'light'));
  /** The scheme the page renders now. */
  readonly rendered = computed<ColorScheme>(() => this.stored() ?? this.system());

  constructor() {
    const onSystemChange = (event: MediaQueryListEvent) => this.systemDark.set(event.matches);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        this.stored.set(this.readStored());
        this.applyMeta();
      }
    };
    this.media?.addEventListener('change', onSystemChange);
    this.window?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => {
      this.media?.removeEventListener('change', onSystemChange);
      this.window?.removeEventListener('storage', onStorage);
    });
    this.applyMeta();
  }

  toggle(): void {
    const target: ColorScheme = this.rendered() === 'dark' ? 'light' : 'dark';
    // Divergence is checked only here, at storage time (never retroactively).
    const next = target === this.system() ? null : target;
    this.stored.set(next);
    this.writeStored(next);
    this.applyMeta();
  }

  private applyMeta(): void {
    const meta = this.document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (meta) {
      meta.content = this.stored() ?? SYSTEM_CONTENT;
    }
  }

  private readStored(): ColorScheme | null {
    try {
      const value = this.window?.localStorage.getItem(THEME_STORAGE_KEY);
      return isColorScheme(value) ? value : null;
    } catch {
      return null;
    }
  }

  private writeStored(value: ColorScheme | null): void {
    try {
      if (value === null) {
        this.window?.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        this.window?.localStorage.setItem(THEME_STORAGE_KEY, value);
      }
    } catch {
      // Storage blocked: the theme still applies for this visit.
    }
  }
}
