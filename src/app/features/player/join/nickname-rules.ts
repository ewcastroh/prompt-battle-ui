/**
 * Client-side nickname check mirroring the API (SPEC §3.1, API.md §5 `NICKNAME_INVALID`): trimmed
 * and NFC-normalized, 3–16 code points of letters (any script, with accents), digits, space, `_` or
 * `-`. It only spares a round trip; the server stays authoritative (taken, blocked, invalid).
 */
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;

const ALLOWED = /^[\p{L}\p{M}\p{Nd} _-]+$/u;

export type NicknameProblem = 'required' | 'invalid';

export function nicknameProblem(raw: string): NicknameProblem | null {
  const nickname = raw.trim().normalize('NFC');
  if (nickname === '') {
    return 'required';
  }
  const length = [...nickname].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX || !ALLOWED.test(nickname)) {
    return 'invalid';
  }
  return null;
}
