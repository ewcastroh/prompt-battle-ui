import { ApiError, isKnownErrorCode } from './api-error';

/** Translation key and interpolation params for an error, ready for Transloco. */
export interface ErrorMessage {
  key: string;
  params: Readonly<Record<string, unknown>>;
}

/** Maps an error code to its translation key (`errors.<CODE>`); unknown codes map to `errors.UNKNOWN`. */
export function errorKey(code: string): string {
  return isKnownErrorCode(code) ? `errors.${code}` : 'errors.UNKNOWN';
}

/** Maps anything thrown by the HTTP layer to a translatable message. Never uses API `detail` text. */
export function errorMessage(error: unknown): ErrorMessage {
  if (error instanceof ApiError) {
    return { key: errorKey(error.code), params: error.params };
  }
  return { key: 'errors.UNKNOWN', params: {} };
}
