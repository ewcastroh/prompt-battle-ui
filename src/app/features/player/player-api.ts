import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CreateAttemptRequest,
  CreateAttemptResponse,
  JoinRequest,
  JoinResponse,
  Me,
  SelectEntryRequest,
} from '../../core/api/api.models';

/** Requests that hang on venue Wi-Fi fail after this, so polling can back off and retry. */
export const REQUEST_TIMEOUT_MS = 10_000;

/** One `GET /api/me` round trip: a new body (200) or "unchanged" (304), plus the clock headers. */
export interface MeResponse {
  readonly status: 200 | 304;
  /** The new state; `null` on 304. */
  readonly me: Me | null;
  readonly etag: string | null;
  /** The `Date` header in epoch ms (one-second resolution), or `null` when missing. */
  readonly serverDate: number | null;
}

/**
 * Player endpoints of docs/API.md §5. Errors reach callers as `ApiError` (problem interceptor);
 * the bearer token is sent explicitly because only player requests carry it.
 */
@Service()
export class PlayerApi {
  private readonly http = inject(HttpClient);

  /** Join (201) or, when `token` is still valid for this city, get the same player back (200). */
  join(city: string, nickname: string, token: string | null): Promise<JoinResponse> {
    const body: JoinRequest = { nickname };
    return firstValueFrom(
      this.http.post<JoinResponse>(`/api/cities/${encodeURIComponent(city)}/players`, body, {
        headers: token ? auth(token) : undefined,
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );
  }

  /** Conditional poll (API.md §3): sends `If-None-Match` and maps 304 to "unchanged". */
  async me(token: string, etag: string | null): Promise<MeResponse> {
    let headers = auth(token);
    if (etag) {
      headers = headers.set('If-None-Match', etag);
    }
    try {
      const response = await firstValueFrom(
        this.http.get<Me>('/api/me', {
          headers,
          observe: 'response',
          // The ETag is handled here; the HTTP cache must not answer or store polls.
          cache: 'no-store',
          timeout: REQUEST_TIMEOUT_MS,
        }),
      );
      return {
        status: 200,
        me: response.body,
        etag: response.headers.get('ETag'),
        serverDate: parseHttpDate(response.headers.get('Date')),
      };
    } catch (error) {
      // HttpClient reports 304 as a failure; the problem interceptor passes it through untouched.
      if (error instanceof HttpErrorResponse && error.status === 304) {
        return {
          status: 304,
          me: null,
          etag: error.headers.get('ETag') ?? etag,
          serverDate: parseHttpDate(error.headers.get('Date')),
        };
      }
      throw error;
    }
  }

  createAttempt(token: string, prompt: string): Promise<CreateAttemptResponse> {
    const body: CreateAttemptRequest = { prompt };
    return firstValueFrom(
      this.http.post<CreateAttemptResponse>('/api/rounds/current/attempts', body, {
        headers: auth(token),
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );
  }

  async selectEntry(token: string, attemptId: string): Promise<void> {
    const body: SelectEntryRequest = { attemptId };
    await firstValueFrom(
      this.http.post<null>('/api/rounds/current/entry', body, {
        headers: auth(token),
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );
  }
}

function auth(token: string): HttpHeaders {
  return new HttpHeaders({ Authorization: `Bearer ${token}` });
}

/** Parses an HTTP-date (`Wed, 02 Dec 2026 15:04:05 GMT`) to epoch ms, or `null`. */
export function parseHttpDate(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
