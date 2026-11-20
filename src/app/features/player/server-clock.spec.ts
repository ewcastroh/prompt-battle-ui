import {
  ServerClock,
  formatCountdown,
  intersectBounds,
  msUntilNextSecond,
  remainingMs,
  remainingSeconds,
  sampleBounds,
} from './server-clock';

/** A response stamped by a server whose clock is `trueOffset` ms ahead of ours. */
function sample(trueOffset: number, sentAt: number, latencyMs: number) {
  const serverInstant = sentAt + latencyMs / 2 + trueOffset;
  return {
    serverDate: Math.floor(serverInstant / 1000) * 1000,
    sentAt,
    receivedAt: sentAt + latencyMs,
  };
}

describe('server clock (API.md §3, D-020 #10)', () => {
  it('bounds the offset by the Date second and the round trip', () => {
    const bounds = sampleBounds({ serverDate: 10_000, sentAt: 8_900, receivedAt: 9_000 });
    expect(bounds).toEqual({ low: 1_000, high: 2_100 });
  });

  it('intersects the bounds of several samples, or reports none when they disagree', () => {
    const a = { serverDate: 10_000, sentAt: 8_900, receivedAt: 9_000 };
    const b = { serverDate: 11_000, sentAt: 9_500, receivedAt: 9_600 };
    expect(intersectBounds([a, b])).toEqual({ low: 1_400, high: 2_100 });
    expect(intersectBounds([])).toBeNull();
    const jumped = { serverDate: 10_000, sentAt: 50_000, receivedAt: 50_100 };
    expect(intersectBounds([a, jumped])).toBeNull();
  });

  it('converges to the true offset from one-second Date headers', () => {
    const clock = new ServerClock();
    const trueOffset = 1_234;
    let estimate = 0;
    for (let i = 0; i < 20; i++) {
      // Polls every 1.5 s with jittery latency.
      estimate = clock.add(sample(trueOffset, 1_000_000 + i * 1_537, 60 + (i % 5) * 35));
    }
    expect(Math.abs(estimate - trueOffset)).toBeLessThan(150);
    expect(clock.offset).toBe(estimate);
  });

  it('starts over from the newest sample when the phone clock jumps', () => {
    const clock = new ServerClock();
    for (let i = 0; i < 5; i++) {
      clock.add(sample(0, 1_000_000 + i * 1_500, 100));
    }
    // The local clock is set back 30 s: the true offset is now +30 s.
    const after = clock.add(sample(30_000, 1_010_000 - 30_000, 100));
    expect(Math.abs(after - 30_000)).toBeLessThan(1_000);
  });

  it('ignores samples that are not usable', () => {
    const clock = new ServerClock();
    expect(clock.add({ serverDate: NaN, sentAt: 1, receivedAt: 2 })).toBe(0);
    expect(clock.add({ serverDate: 10_000, sentAt: 5_000, receivedAt: 4_000 })).toBe(0);
    clock.add(sample(500, 1_000_000, 100));
    clock.reset();
    expect(clock.offset).toBe(0);
  });

  it('counts down to endsAt on the server clock, never below zero', () => {
    const endsAt = '2026-12-02T15:17:00.000Z';
    const end = Date.parse(endsAt);
    // The server is 2 s ahead: 62 s left locally means 60 s left on the server.
    expect(remainingMs(endsAt, end - 62_000, 2_000)).toBe(60_000);
    expect(remainingMs(endsAt, end + 5_000, 0)).toBe(0);
    expect(remainingMs('not a date', 0, 0)).toBe(0);
  });

  it('shows whole seconds rounded up, so 0:00 appears only at the end', () => {
    expect(remainingSeconds(60_000)).toBe(60);
    expect(remainingSeconds(59_001)).toBe(60);
    expect(remainingSeconds(1)).toBe(1);
    expect(remainingSeconds(0)).toBe(0);
    expect(remainingSeconds(-5)).toBe(0);
  });

  it('formats m:ss like a stopwatch', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(480)).toBe('8:00');
    expect(formatCountdown(1_800)).toBe('30:00');
    expect(formatCountdown(-3)).toBe('0:00');
  });

  it('ticks just after each second boundary', () => {
    expect(msUntilNextSecond(4_250)).toBe(255);
    expect(msUntilNextSecond(4_000)).toBe(1_005);
    expect(msUntilNextSecond(0)).toBe(1_000);
  });
});
