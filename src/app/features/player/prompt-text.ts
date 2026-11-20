import { Attempt } from '../../core/api/api.models';

/**
 * Prompt rules shared by the editor and the generate button (SPEC §3.3, API.md §5).
 *
 * The API trims, collapses whitespace and allows 1–300 code points. The editor caps the raw text
 * with the native `maxlength`, which counts UTF-16 units: raw units ≥ normalized code points, so a
 * prompt that fits the editor always fits the API, and the counter matches what the field allows.
 */
export const PROMPT_MAX_LENGTH = 300;

/** From this many characters the counter warns (with text, not only color). */
export const PROMPT_WARN_AT = 270;

/** Same normalization as the API: trim, then collapse runs of whitespace to one space. */
export function normalizePrompt(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Characters as the editor counts them (UTF-16 units, like `maxlength`). */
export function promptLength(raw: string): number {
  return raw.length;
}

export type CounterLevel = 'ok' | 'warn' | 'full';

export function counterLevel(length: number): CounterLevel {
  if (length >= PROMPT_MAX_LENGTH) {
    return 'full';
  }
  return length >= PROMPT_WARN_AT ? 'warn' : 'ok';
}

/**
 * The earlier attempt with the same normalized prompt that produced (or is producing) an image, if
 * any. With the round's fixed seed the same prompt gives the same image, so generating it again would
 * only spend an attempt (D-024). Blocked and failed attempts don't count: retrying those is fine.
 */
export function duplicateOf(raw: string, attempts: readonly Attempt[]): Attempt | null {
  const prompt = normalizePrompt(raw);
  if (prompt === '') {
    return null;
  }
  return (
    attempts.find(
      (attempt) =>
        (attempt.status === 'DONE' ||
          attempt.status === 'QUEUED' ||
          attempt.status === 'GENERATING') &&
        normalizePrompt(attempt.prompt) === prompt,
    ) ?? null
  );
}
