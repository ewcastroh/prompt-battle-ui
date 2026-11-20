import { TestBed } from '@angular/core/testing';
import { translocoTesting } from '../../../../testing/transloco-testing';
import { Countdown } from './countdown';

describe('Countdown (DESIGN.md §7)', () => {
  const NOW = Date.parse('2026-12-02T15:10:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(NOW);
    TestBed.configureTestingModule({ imports: [translocoTesting()] });
  });

  afterEach(() => vi.useRealTimers());

  async function render(endsInMs: number, offset = 0) {
    const fixture = TestBed.createComponent(Countdown);
    fixture.componentRef.setInput('endsAt', new Date(NOW + endsInMs).toISOString());
    fixture.componentRef.setInput('serverOffset', offset);
    const lastMinute = vi.fn();
    fixture.componentInstance.lastMinuteStarted.subscribe(lastMinute);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    return { fixture, host, lastMinute };
  }

  it('shows m:ss of the server clock in a timer that is not a live region', async () => {
    const { host } = await render(252_000);
    const timer = host.querySelector('[role="timer"]')!;
    expect(timer.textContent).toContain('4:12');
    expect(timer.textContent).toContain('Tiempo restante');
    expect(host.querySelector('[aria-live]')).toBeNull();
  });

  it('uses the server offset (the server is 2 s ahead)', async () => {
    const { host } = await render(252_000, 2_000);
    expect(host.querySelector('.value')?.textContent).toBe('4:10');
  });

  it('ticks every second', async () => {
    const { fixture, host } = await render(65_000);
    expect(host.querySelector('.value')?.textContent).toBe('1:05');
    // Ticks land 5 ms after each second boundary.
    await vi.advanceTimersByTimeAsync(1_005);
    await fixture.whenStable();
    expect(host.querySelector('.value')?.textContent).toBe('1:04');
  });

  it('warns in the last minute with color and a text cue, once', async () => {
    const { fixture, host, lastMinute } = await render(61_000);
    expect(host.classList).not.toContain('warn');
    expect(lastMinute).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_100);
    await fixture.whenStable();
    expect(host.classList).toContain('warn');
    expect(host.textContent).toContain('¡Último minuto!');
    expect(lastMinute).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    await fixture.whenStable();
    expect(lastMinute).toHaveBeenCalledTimes(1);
  });

  it('stops at 0:00 and says time is up', async () => {
    const { fixture, host } = await render(1_500);
    await vi.advanceTimersByTimeAsync(3_000);
    await fixture.whenStable();
    expect(host.querySelector('.value')?.textContent).toBe('0:00');
    expect(host.textContent).toContain('¡Se acabó el tiempo!');
  });
});
