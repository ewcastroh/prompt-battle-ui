import { nicknameProblem } from '../features/player/join/nickname-rules';
import { FIXTURE_DATA, FIXTURE_SCREENS, fitTo, fixtureMe } from './fake-fixtures';

const CITY = { code: 'mde', name: 'Medellín' };
const EPOCH = Date.parse('2026-12-02T15:10:00.000Z');
const CLAIM_ALPHABET = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

describe('player fixtures (dev tool, break-ui)', () => {
  it('cuts text to a UTF-16 limit without splitting a character', () => {
    expect(fitTo('ab🚌', 3)).toBe('ab');
    expect(fitTo('ab🚌', 4)).toBe('ab🚌');
  });

  for (const data of FIXTURE_DATA) {
    it(`keeps every ${data} value inside the API limits (worst case = the limit, not past it)`, () => {
      for (const screen of FIXTURE_SCREENS) {
        const fixture = fixtureMe(screen, data, CITY, EPOCH);
        if (fixture.kind === 'error') {
          expect(fixture.code).toBe('PLAYER_KICKED');
          continue;
        }
        const { me } = fixture;
        expect(nicknameProblem(me.player.nickname), screen).toBeNull();
        expect(me.player.claimCode, screen).toMatch(CLAIM_ALPHABET);
        if (me.round) {
          expect(me.round.name.length, screen).toBeLessThanOrEqual(60);
          expect(me.round.attemptsPerPlayer, screen).toBeLessThanOrEqual(10);
          expect(me.round.attemptsLeft, screen).toBeGreaterThanOrEqual(0);
        }
        for (const attempt of me.attempts) {
          expect(attempt.prompt.length, screen).toBeLessThanOrEqual(300);
          expect(attempt.prompt.trim().length, screen).toBeGreaterThan(0);
        }
        // At most one generation in flight per player.
        const live = me.attempts.filter((a) => a.status === 'QUEUED' || a.status === 'GENERATING');
        expect(live.length, screen).toBeLessThanOrEqual(1);
      }
    });
  }

  it('uses the longest values the API accepts in the worst case', () => {
    const fixture = fixtureMe('round-open', 'worst', CITY, EPOCH);
    if (fixture.kind !== 'me') throw new Error('expected a state');
    expect([...fixture.me.player.nickname].length).toBe(16);
    expect(fixture.me.round!.attemptsPerPlayer).toBe(10);
    expect(Math.max(...fixture.me.attempts.map((a) => a.prompt.length))).toBe(300);
  });

  it('is stable for a page load, so ETags only change when the fixture does', () => {
    expect(fixtureMe('round-open', 'demo', CITY, EPOCH)).toEqual(
      fixtureMe('round-open', 'demo', CITY, EPOCH),
    );
  });
});
