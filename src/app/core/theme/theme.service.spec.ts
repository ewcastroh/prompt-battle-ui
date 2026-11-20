import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

/** A controllable `(prefers-color-scheme: dark)` media query. */
class FakeMediaQueryList extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }
  readonly media = '(prefers-color-scheme: dark)';
  /** Simulates the OS switching its color scheme. */
  set(dark: boolean): void {
    this.matches = dark;
    const event = new Event('change') as Event & { matches: boolean };
    Object.defineProperty(event, 'matches', { value: dark });
    this.dispatchEvent(event);
  }
}

describe('ThemeService (DESIGN.md §2 two-state toggle)', () => {
  let mql: FakeMediaQueryList;
  let meta: HTMLMetaElement;

  function setup(systemDark: boolean, stored?: 'light' | 'dark') {
    mql = new FakeMediaQueryList(systemDark);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);
    if (stored) {
      localStorage.setItem(THEME_STORAGE_KEY, stored);
    }
    // index.html's inline script would have applied the stored value already.
    meta.content = stored ?? 'light dark';
    return TestBed.inject(ThemeService);
  }

  const stored = () => localStorage.getItem(THEME_STORAGE_KEY);

  beforeEach(() => {
    localStorage.clear();
    // jsdom has no matchMedia; define it so it can be spied on.
    window.matchMedia ??= (() => null) as unknown as typeof window.matchMedia;
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    document.head.append(meta);
  });

  afterEach(() => {
    meta.remove();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('follows the system when nothing is stored', () => {
    const theme = setup(false);
    expect(theme.override()).toBeNull();
    expect(theme.rendered()).toBe('light');
    expect(meta.content).toBe('light dark');
  });

  it('toggling from system light stores "dark" (target differs from the system)', () => {
    const theme = setup(false);
    theme.toggle();
    expect(stored()).toBe('dark');
    expect(theme.rendered()).toBe('dark');
    expect(meta.content).toBe('dark');
  });

  it('toggling from system dark stores "light"', () => {
    const theme = setup(true);
    expect(theme.rendered()).toBe('dark');
    theme.toggle();
    expect(stored()).toBe('light');
    expect(meta.content).toBe('light');
  });

  it('toggling back to the system preference removes the stored value', () => {
    const theme = setup(false);
    theme.toggle(); // dark (stored)
    theme.toggle(); // light = system → back to system
    expect(stored()).toBeNull();
    expect(theme.override()).toBeNull();
    expect(theme.rendered()).toBe('light');
    expect(meta.content).toBe('light dark');
  });

  it('targets the opposite of what is rendered, not of the system default', () => {
    // System light, but the user pinned dark earlier: the page renders dark.
    const theme = setup(false, 'dark');
    expect(theme.rendered()).toBe('dark');
    theme.toggle();
    // Target = light (opposite of rendered), which equals the system → remove.
    expect(stored()).toBeNull();
    expect(theme.rendered()).toBe('light');
  });

  it('never removes a stored value because the system later matches it', () => {
    // The guide's scenario, starting with the OS in light.
    const theme = setup(false);
    theme.toggle();
    expect(stored()).toBe('dark');

    mql.set(true); // OS → dark: stored value now matches, but is kept.
    expect(stored()).toBe('dark');
    expect(theme.override()).toBe('dark');
    expect(meta.content).toBe('dark');

    mql.set(false); // OS → light again: the site stays dark.
    expect(theme.rendered()).toBe('dark');
    expect(meta.content).toBe('dark');

    theme.toggle(); // target light = system → removed.
    expect(stored()).toBeNull();
    expect(meta.content).toBe('light dark');
  });

  it('follows OS changes (matchMedia change event) while in system mode', () => {
    const theme = setup(false);
    mql.set(true);
    expect(theme.system()).toBe('dark');
    expect(theme.rendered()).toBe('dark');
    expect(meta.content).toBe('light dark');
  });

  it('stays in sync with other tabs through the storage event', () => {
    const theme = setup(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }));
    expect(theme.override()).toBe('dark');
    expect(meta.content).toBe('dark');

    localStorage.removeItem(THEME_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: null }));
    expect(theme.override()).toBeNull();
    expect(meta.content).toBe('light dark');
  });

  it('ignores storage events for other keys', () => {
    const theme = setup(false);
    window.dispatchEvent(new StorageEvent('storage', { key: 'lang', newValue: 'en' }));
    expect(theme.override()).toBeNull();
  });

  it('still applies the theme when storage is blocked', () => {
    const theme = setup(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => theme.toggle()).not.toThrow();
    expect(theme.rendered()).toBe('dark');
    expect(meta.content).toBe('dark');
  });
});
