import { HttpErrorResponse, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ApiError, ErrorCode, isKnownErrorCode } from './api-error';

/**
 * Turns HTTP failures into `ApiError { status, code, params }` (API.md §2).
 * Only the machine-readable `code` and `params` are kept; `detail` and `title` are never shown.
 * Non-error statuses that HttpClient reports as failures (e.g. 304 Not Modified) pass through unchanged.
 */
export function problemInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 400)) {
        return throwError(() => toApiError(error));
      }
      return throwError(() => error);
    }),
  );
}

export function toApiError(error: HttpErrorResponse): ApiError {
  if (error.status === 0) {
    return new ApiError(0, 'NETWORK_ERROR');
  }
  const body = parseBody(error.error);
  const code: ErrorCode = isKnownErrorCode(body?.['code'])
    ? body['code']
    : error.status >= 500
      ? 'INTERNAL_ERROR'
      : 'UNKNOWN';
  const params = body?.['params'];
  return new ApiError(error.status, code, isRecord(params) ? params : {});
}

function parseBody(body: unknown): Record<string, unknown> | null {
  if (isRecord(body)) {
    return body;
  }
  if (typeof body === 'string') {
    try {
      const parsed: unknown = JSON.parse(body);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
