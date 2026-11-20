import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import {
  AdminEntry,
  AdminPlayer,
  AdminState,
  Alert,
  ProbeResponse,
  Providers,
  RoundDefinition,
  RoundInput,
  TargetPreview,
} from '../../core/api/api.models';
import { ConditionalResponse, conditionalGet } from '../../core/api/conditional-get';
import { AdminSessionService } from './admin-session.service';

/** Synchronous calls that can take long on the server (target preview, probe). */
const LONG_TIMEOUT_MS = 90_000;
const TIMEOUT_MS = 15_000;

/** A downloaded file: its content and the name from `Content-Disposition`. */
export interface DownloadedFile {
  readonly blob: Blob;
  readonly filename: string;
}

/** `attachment; filename="results-mde.csv"` → `results-mde.csv`. */
export function filenameFrom(disposition: string | null, fallback: string): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '');
  return match ? decodeURIComponent(match[1].trim()) : fallback;
}

/**
 * Admin endpoints of docs/API.md §7. Every call carries `X-Admin-Token` from the session; a 401
 * ends the session (the console goes back to the login form). Errors reach callers as `ApiError`.
 */
@Service({ autoProvided: false })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly session = inject(AdminSessionService);

  state(etag: string | null): Promise<ConditionalResponse<AdminState>> {
    return this.guard(conditionalGet<AdminState>(this.http, '/api/admin/state', etag, this.auth()));
  }

  // ---------- Rounds (shared)

  rounds(): Promise<RoundDefinition[]> {
    return this.get('/api/admin/rounds');
  }

  generateTarget(prompt: string, seed: number | null): Promise<TargetPreview> {
    return this.send(
      'POST',
      '/api/admin/rounds/generate-target',
      { prompt, seed },
      LONG_TIMEOUT_MS,
    );
  }

  /** Creates (no `id`) or updates a round, with a preview (JSON) or an uploaded target (multipart). */
  saveRound(id: string | null, input: RoundInput, target: File | null): Promise<RoundDefinition> {
    const method = id ? 'PUT' : 'POST';
    const path = id ? `/api/admin/rounds/${encodeURIComponent(id)}` : '/api/admin/rounds';
    if (!target) {
      return this.send(method, path, input, LONG_TIMEOUT_MS);
    }
    const form = new FormData();
    const { previewId, ...round } = input;
    void previewId;
    form.append('round', JSON.stringify(round));
    form.append('target', target, target.name);
    return this.send(method, path, form, LONG_TIMEOUT_MS);
  }

  deleteRound(id: string): Promise<void> {
    return this.send('DELETE', `/api/admin/rounds/${encodeURIComponent(id)}`);
  }

  calibrate(id: string): Promise<RoundDefinition> {
    return this.send('POST', `/api/admin/rounds/${encodeURIComponent(id)}/calibrate`);
  }

  // ---------- Own city run (each returns the admin state)

  runAction(
    action:
      | { readonly kind: 'start' | 'close' | 'extend' | 'rescore'; readonly roundId: string }
      | { readonly kind: 'mini-podium/start' | 'mini-podium/next' }
      | { readonly kind: 'podium/start' | 'podium/next' | 'podium/reset' }
      | { readonly kind: 'practice/gallery'; readonly show: boolean },
  ): Promise<AdminState> {
    switch (action.kind) {
      case 'start':
      case 'close':
      case 'extend':
      case 'rescore':
        return this.send(
          'POST',
          `/api/admin/rounds/${encodeURIComponent(action.roundId)}/${action.kind}`,
        );
      case 'practice/gallery':
        return this.send('POST', '/api/admin/practice/gallery', { show: action.show });
      default:
        return this.send('POST', `/api/admin/${action.kind}`);
    }
  }

  // ---------- Players and entries (own city)

  players(): Promise<AdminPlayer[]> {
    return this.get('/api/admin/players');
  }

  rename(playerId: string, nickname: string): Promise<AdminPlayer> {
    return this.send('POST', `/api/admin/players/${encodeURIComponent(playerId)}/rename`, {
      nickname,
    });
  }

  kick(playerId: string): Promise<void> {
    return this.send('POST', `/api/admin/players/${encodeURIComponent(playerId)}/kick`);
  }

  entries(roundId: string): Promise<AdminEntry[]> {
    return this.get(`/api/admin/entries?roundId=${encodeURIComponent(roundId)}`);
  }

  hideEntry(entryId: string, hidden: boolean): Promise<void> {
    return this.send('POST', `/api/admin/entries/${encodeURIComponent(entryId)}/hide`, {
      hidden,
    });
  }

  /** `GET /api/admin/results.csv` as a blob; the name comes from `Content-Disposition`. */
  async resultsCsv(city: string): Promise<DownloadedFile> {
    const response = await this.guard(
      firstValueFrom(
        this.http.get('/api/admin/results.csv', {
          headers: this.auth(),
          observe: 'response',
          responseType: 'blob',
          cache: 'no-store',
          timeout: TIMEOUT_MS,
        }),
      ),
    );
    return {
      blob: response.body ?? new Blob([], { type: 'text/csv' }),
      filename: filenameFrom(response.headers.get('Content-Disposition'), `results-${city}.csv`),
    };
  }

  // ---------- Shared controls

  providers(): Promise<Providers> {
    return this.get('/api/admin/providers');
  }

  forceProvider(providerId: string): Promise<Providers> {
    return this.send('POST', '/api/admin/providers/active', { providerId });
  }

  probe(): Promise<ProbeResponse> {
    return this.send('POST', '/api/admin/providers/probe', null, LONG_TIMEOUT_MS);
  }

  alerts(since: string | null): Promise<Alert[]> {
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    return this.get(`/api/admin/alerts${query}`);
  }

  resetEvent(confirm: string): Promise<void> {
    return this.send('POST', '/api/admin/event/reset', { confirm });
  }

  // ---------- plumbing

  private auth(): HttpHeaders {
    return new HttpHeaders({ 'X-Admin-Token': this.session.token() ?? '' });
  }

  private get<T>(path: string): Promise<T> {
    return this.guard(
      firstValueFrom(
        this.http.get<T>(path, { headers: this.auth(), cache: 'no-store', timeout: TIMEOUT_MS }),
      ),
    );
  }

  private send<T>(
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: unknown = null,
    timeout = TIMEOUT_MS,
  ): Promise<T> {
    const request = this.http.request<T>(method, path, {
      body,
      headers: this.auth(),
      timeout,
    }) as Observable<T>;
    return this.guard(firstValueFrom(request, { defaultValue: undefined as T }));
  }

  /** A 401 on any admin call ends the session (API.md §7: missing or unknown token). */
  private async guard<T>(call: Promise<T>): Promise<T> {
    try {
      return await call;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.code === 'UNAUTHORIZED')) {
        this.session.expired();
      }
      throw error;
    }
  }
}
