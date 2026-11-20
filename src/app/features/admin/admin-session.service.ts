import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../core/api/api-error';
import { AdminMe } from '../../core/api/api.models';
import { AdminTokenStore } from './admin-token-store';

/** Why the login form is showing. `CITY_MISMATCH` is UI-only: the token belongs to another city. */
export type AdminLoginReason = 'UNAUTHORIZED' | 'LOGGED_OUT' | 'RESET' | null;

export type AdminSession =
  /** `retrying`: the stored token couldn't be checked (no connection) and is being tried again. */
  | { readonly kind: 'checking'; readonly retrying: boolean }
  | { readonly kind: 'login'; readonly reason: AdminLoginReason }
  | { readonly kind: 'ready'; readonly city: string; readonly cityName: string };

/** A login attempt's outcome: `null` on success, or what to show on the form. */
export type LoginError =
  | { readonly kind: 'api'; readonly error: ApiError }
  | { readonly kind: 'city-mismatch'; readonly tokenCity: string; readonly tokenCityName: string };

/**
 * The admin's session for the route's city (SPEC §10.1, D-020 #9). The token is checked with
 * `GET /api/admin/me`, and it is accepted only if its city equals the route's `:city`: a Bogotá
 * token never runs the Medellín console. It is stored per city; a 401 anywhere (unknown token,
 * event reset) ends the session.
 */
@Service({ autoProvided: false })
export class AdminSessionService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(AdminTokenStore);
  private readonly sessionSignal = signal<AdminSession>({ kind: 'checking', retrying: false });
  private routeCity: string | null = null;
  private currentToken: string | null = null;
  private run = 0;

  readonly session = this.sessionSignal.asReadonly();
  readonly ready = computed(() => this.sessionSignal().kind === 'ready');

  /** The signed-in token (never shown, never logged). */
  token(): string | null {
    return this.sessionSignal().kind === 'ready' ? this.currentToken : null;
  }

  /** Starts the session for `city`: a stored token is checked again, otherwise the form shows. */
  async start(city: string): Promise<void> {
    if (this.routeCity === city) {
      return;
    }
    this.routeCity = city;
    const run = ++this.run;
    const stored = this.tokens.get(city);
    if (!stored) {
      this.sessionSignal.set({ kind: 'login', reason: null });
      return;
    }
    this.sessionSignal.set({ kind: 'checking', retrying: false });
    // Only a 401 means the token is gone (event reset, wrong token). A network error at the venue
    // keeps it and tries again, ×2 up to 10 s, so the admin never retypes a 24+ character token.
    for (let attempt = 0; run === this.run; attempt++) {
      const error = await this.check(city, stored, run);
      if (!error || run !== this.run) {
        return;
      }
      if (error.kind === 'city-mismatch' || error.error.code === 'UNAUTHORIZED') {
        this.tokens.clear(city);
        this.sessionSignal.set({
          kind: 'login',
          reason: error.kind === 'api' ? 'UNAUTHORIZED' : null,
        });
        return;
      }
      this.sessionSignal.set({ kind: 'checking', retrying: true });
      await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, 1000 * 2 ** attempt)));
    }
  }

  /** Signs in with `token`; returns what to show on the form, or `null` once signed in. */
  async login(token: string): Promise<LoginError | null> {
    const city = this.routeCity;
    if (!city) {
      return null;
    }
    return this.check(city, token.trim(), ++this.run);
  }

  logout(reason: AdminLoginReason = 'LOGGED_OUT'): void {
    if (this.routeCity) {
      this.tokens.clear(this.routeCity);
    }
    this.run++;
    this.currentToken = null;
    this.sessionSignal.set({ kind: 'login', reason });
  }

  /** Any admin call answered 401: the token stopped working (event reset, rotated token). */
  expired(): void {
    if (this.sessionSignal().kind === 'ready') {
      this.logout('UNAUTHORIZED');
    }
  }

  private async check(city: string, token: string, run: number): Promise<LoginError | null> {
    let me: AdminMe;
    try {
      me = await firstValueFrom(
        this.http.get<AdminMe>('/api/admin/me', {
          headers: new HttpHeaders({ 'X-Admin-Token': token }),
          cache: 'no-store',
        }),
      );
    } catch (error) {
      return { kind: 'api', error: error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN') };
    }
    if (me.city !== city) {
      return { kind: 'city-mismatch', tokenCity: me.city, tokenCityName: me.cityName };
    }
    if (run === this.run) {
      this.tokens.set(city, token);
      this.currentToken = token;
      this.sessionSignal.set({ kind: 'ready', city: me.city, cityName: me.cityName });
    }
    return null;
  }
}
