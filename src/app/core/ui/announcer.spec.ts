import { TestBed } from '@angular/core/testing';
import { Announcer, LiveAnnouncer } from './announcer';

describe('Announcer (one polite live region per page)', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('renders one polite region and fills it after a short delay', async () => {
    const fixture = TestBed.createComponent(LiveAnnouncer);
    await fixture.whenStable();
    const region = (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]')!;
    expect(region.textContent?.trim()).toBe('');

    TestBed.inject(Announcer).announce('¡La ronda empezó!', 200);
    await vi.advanceTimersByTimeAsync(200);
    await fixture.whenStable();
    expect(region.textContent?.trim()).toBe('¡La ronda empezó!');

    // Cleared later, so stale text isn't found when reading the page.
    await vi.advanceTimersByTimeAsync(8_000);
    await fixture.whenStable();
    expect(region.textContent?.trim()).toBe('');
  });

  it('can repeat the same text, and a newer message replaces a pending one', async () => {
    const announcer = TestBed.inject(Announcer);
    announcer.announce('uno', 100);
    announcer.announce('dos', 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(announcer.message()).toBe('dos');
    announcer.announce('dos', 100);
    expect(announcer.message()).toBe('');
    await vi.advanceTimersByTimeAsync(100);
    expect(announcer.message()).toBe('dos');
  });

  it('holds announcements while a modal dialog makes the page inert', async () => {
    const announcer = TestBed.inject(Announcer);
    announcer.modalOpened();
    announcer.announce('Intento 2 listo');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(announcer.message()).toBe('');
    announcer.modalClosed();
    await vi.advanceTimersByTimeAsync(600);
    expect(announcer.message()).toBe('Intento 2 listo');
  });
});
