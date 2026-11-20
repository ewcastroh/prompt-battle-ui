import { Me, Phase } from '../../core/api/api.models';
import { PlayerScreen, screenFor } from './player-screen';
import { screenTitle } from './player-shell';

function me(phase: Phase, overrides: Partial<Me> = {}): Me {
  return {
    player: { id: 'p', nickname: 'Ana_dev', claimCode: 'K7QX', city: 'mde', cityName: 'Medellín' },
    phase,
    round: {
      id: 'r',
      name: 'Café al amanecer',
      scored: true,
      targetUrl: '/img/t.jpg',
      targetThumbUrl: '/img/t_thumb.jpg',
      startedAt: '2026-12-02T15:09:00.000Z',
      endsAt: '2026-12-02T15:17:00.000Z',
      attemptsPerPlayer: 3,
      attemptsLeft: 3,
      entryAttemptId: null,
    },
    attempts: [],
    final: null,
    ...overrides,
  };
}

describe('player screen per phase (API.md §4)', () => {
  it('shows loading while a stored token is checked, and join without a usable token', () => {
    expect(screenFor({ kind: 'starting' })).toBe('loading');
    expect(screenFor({ kind: 'join', reason: null })).toBe('join');
    expect(screenFor({ kind: 'join', reason: 'PLAYER_KICKED' })).toBe('join');
  });

  it.each<[Phase, Partial<Me>, PlayerScreen]>([
    ['LOBBY', { round: null }, 'lobby'],
    ['ROUND_OPEN', {}, 'round-open'],
    ['ROUND_OPEN', { round: null }, 'lobby'],
    ['ROUND_CLOSING', {}, 'round-closed'],
    ['ROUND_SCORED', {}, 'waiting'],
    ['MINI_PODIUM', {}, 'waiting'],
    ['FINAL_SCORING', { round: null }, 'waiting'],
    ['PODIUM_REVEAL', { round: null }, 'waiting'],
    ['PODIUM_REVEAL', { round: null, final: { rank: 1, total: 171.3, podium: true } }, 'final'],
    ['FINISHED', { round: null, final: { rank: 7, total: 143.2, podium: false } }, 'final'],
    ['FINISHED', { round: null }, 'waiting'],
  ])('%s %o → %s', (phase, overrides, screen) => {
    expect(screenFor({ kind: 'playing', me: me(phase, overrides) })).toBe(screen);
  });

  it('titles each screen; the open round uses its own name', () => {
    expect(screenTitle('join', null)).toEqual({ key: 'app.eventTitle', params: {} });
    expect(screenTitle('lobby', me('LOBBY'))).toEqual({
      key: 'player.title.lobby',
      params: { nickname: 'Ana_dev' },
    });
    expect(screenTitle('round-open', me('ROUND_OPEN'))).toEqual({ text: 'Café al amanecer' });
    const practice = me('ROUND_CLOSING');
    practice.round!.scored = false;
    expect(screenTitle('round-closed', practice)).toEqual({
      key: 'player.title.practiceClosed',
      params: {},
    });
    expect(screenTitle('waiting', me('MINI_PODIUM'))).toEqual({
      key: 'player.title.waiting.MINI_PODIUM',
      params: {},
    });
  });
});
