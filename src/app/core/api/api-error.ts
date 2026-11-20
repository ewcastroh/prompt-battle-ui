/**
 * Every error code of docs/API.md §2, in contract order. Codes are never removed.
 * The UI translates each one with the key `errors.<CODE>`.
 */
export const API_ERROR_CODES = [
  'NICKNAME_INVALID',
  'NICKNAME_TAKEN',
  'NICKNAME_BLOCKED',
  'CITY_NOT_FOUND',
  'UNAUTHORIZED',
  'PLAYER_KICKED',
  'ROUND_NOT_OPEN',
  'GENERATION_IN_FLIGHT',
  'NO_ATTEMPTS_LEFT',
  'PROMPT_INVALID',
  'PROMPT_BLOCKED',
  'ATTEMPT_NOT_FOUND',
  'ATTEMPT_NOT_SELECTABLE',
  'GENERATION_FAILED',
  'INVALID_TRANSITION',
  'ROUND_LOCKED',
  'RATE_LIMITED',
  'ADMIN_FORBIDDEN',
  'RESET_NOT_CONFIRMED',
  'INTERNAL_ERROR',
  'ROUND_NOT_FOUND',
  'PLAYER_NOT_FOUND',
  'ENTRY_NOT_FOUND',
  'PREVIEW_NOT_FOUND',
  'PROVIDER_NOT_FOUND',
  'PROVIDER_UNAVAILABLE',
  'ROUND_NOT_READY',
  'UPLOAD_INVALID',
  'VALIDATION_FAILED',
  'SCORING_FAILED',
  'NOT_FOUND',
] as const;

/**
 * UI-only codes for failures that never reach the API's error handler:
 * `NETWORK_ERROR` (no response: offline, DNS, CORS) and `UNKNOWN` (a response without a known code).
 */
export const CLIENT_ERROR_CODES = ['NETWORK_ERROR', 'UNKNOWN'] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type ErrorCode = ApiErrorCode | ClientErrorCode;

const KNOWN_CODES: ReadonlySet<string> = new Set<string>([
  ...API_ERROR_CODES,
  ...CLIENT_ERROR_CODES,
]);

export function isKnownErrorCode(code: unknown): code is ErrorCode {
  return typeof code === 'string' && KNOWN_CODES.has(code);
}

/** What callers of the HTTP layer receive instead of `HttpErrorResponse`. Never carries API text. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly params: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
    this.name = 'ApiError';
  }
}
