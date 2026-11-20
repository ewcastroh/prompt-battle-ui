import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { parseHttpDate } from '../time/server-clock';

/** Requests that hang on venue Wi-Fi fail after this, so polling can back off and retry. */
export const POLL_REQUEST_TIMEOUT_MS = 10_000;

/** One conditional GET (API.md §3): a new body (200) or "unchanged" (304), plus the clock headers. */
export interface ConditionalResponse<T> {
  readonly status: 200 | 304;
  /** The new body; `null` on 304. */
  readonly body: T | null;
  readonly etag: string | null;
  /** The `Date` header in epoch ms (one-second resolution), or `null` when missing. */
  readonly serverDate: number | null;
}

/**
 * GETs `url` with `If-None-Match: etag` and maps 304 to "unchanged". The HTTP cache is bypassed:
 * the ETag is handled here, so the browser must neither answer nor store polls.
 */
export async function conditionalGet<T>(
  http: HttpClient,
  url: string,
  etag: string | null,
  headers: HttpHeaders = new HttpHeaders(),
): Promise<ConditionalResponse<T>> {
  const sent = etag ? headers.set('If-None-Match', etag) : headers;
  try {
    const response = await firstValueFrom(
      http.get<T>(url, {
        headers: sent,
        observe: 'response',
        cache: 'no-store',
        timeout: POLL_REQUEST_TIMEOUT_MS,
      }),
    );
    return {
      status: 200,
      body: response.body,
      etag: response.headers.get('ETag'),
      serverDate: parseHttpDate(response.headers.get('Date')),
    };
  } catch (error) {
    // HttpClient reports 304 as a failure; the problem interceptor passes it through untouched.
    if (error instanceof HttpErrorResponse && error.status === 304) {
      return {
        status: 304,
        body: null,
        etag: error.headers.get('ETag') ?? etag,
        serverDate: parseHttpDate(error.headers.get('Date')),
      };
    }
    throw error;
  }
}
