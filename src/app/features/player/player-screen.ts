import { Me } from '../../core/api/api.models';

/** Why the join form is showing instead of the game. */
export type JoinReason = 'UNAUTHORIZED' | 'PLAYER_KICKED';

/** What the phone knows about its player in this city. */
export type PlayerSession =
  /** A stored token is being checked (first `GET /api/me` in flight). */
  | { readonly kind: 'starting' }
  /** No usable token: the player must join. `reason` explains a lost session. */
  | { readonly kind: 'join'; readonly reason: JoinReason | null }
  /** Joined; `me` is the latest `GET /api/me` body. */
  | { readonly kind: 'playing'; readonly me: Me };

/** The player screens of SPEC §10.4, plus a loading state and a "watch the stage" state. */
export type PlayerScreen =
  'loading' | 'join' | 'lobby' | 'round-open' | 'round-closed' | 'waiting' | 'final';

/**
 * Maps the session to the screen to show (API.md §4 phases):
 * - `LOBBY` → lobby (also after a practice round).
 * - `ROUND_OPEN` → the round (prompt editor and attempts).
 * - `ROUND_CLOSING` → "Round closed! The AI is scoring…" (practice: closed, no scoring).
 * - `ROUND_SCORED`, `MINI_PODIUM`, `FINAL_SCORING` → waiting: results happen on the stage.
 * - `PODIUM_REVEAL`, `FINISHED` → the player's final result once the API sends it (after rank #1 is
 *   revealed); until then, waiting.
 */
export function screenFor(session: PlayerSession): PlayerScreen {
  switch (session.kind) {
    case 'starting':
      return 'loading';
    case 'join':
      return 'join';
    case 'playing':
      return phaseScreen(session.me);
  }
}

function phaseScreen(me: Me): PlayerScreen {
  switch (me.phase) {
    case 'LOBBY':
      return 'lobby';
    case 'ROUND_OPEN':
      return me.round ? 'round-open' : 'lobby';
    case 'ROUND_CLOSING':
      return 'round-closed';
    case 'ROUND_SCORED':
    case 'MINI_PODIUM':
    case 'FINAL_SCORING':
      return 'waiting';
    case 'PODIUM_REVEAL':
    case 'FINISHED':
      return me.final ? 'final' : 'waiting';
  }
}
