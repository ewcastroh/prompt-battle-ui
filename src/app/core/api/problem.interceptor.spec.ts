import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { en, es } from '../../../testing/transloco-testing';
import { API_ERROR_CODES, ApiError, CLIENT_ERROR_CODES } from './api-error';
import { errorKey, errorMessage } from './error-messages';
import { problemInterceptor } from './problem.interceptor';

describe('problemInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function failWith(
    body: string | object | null,
    status: number,
    statusText = 'Error',
  ): Promise<unknown> {
    const result = firstValueFrom(http.get('/api/me')).catch((error: unknown) => error);
    backend.expectOne('/api/me').flush(body, { status, statusText });
    return result;
  }

  it('maps a ProblemDetail to ApiError with code and params, dropping detail', async () => {
    const error = await failWith(
      {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'Round 7b0e cannot start in phase ROUND_OPEN',
        code: 'INVALID_TRANSITION',
        params: { phase: 'ROUND_OPEN' },
      },
      409,
    );

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe('INVALID_TRANSITION');
    expect(apiError.params).toEqual({ phase: 'ROUND_OPEN' });
    expect(apiError.message).not.toContain('Round 7b0e');
  });

  it('parses a problem body that arrives as text', async () => {
    const error = (await failWith(
      JSON.stringify({ code: 'NICKNAME_TAKEN', status: 409 }),
      409,
    )) as ApiError;
    expect(error.code).toBe('NICKNAME_TAKEN');
    expect(error.params).toEqual({});
  });

  it('maps a network failure (status 0) to NETWORK_ERROR', async () => {
    const result = firstValueFrom(http.get('/api/me')).catch((error: unknown) => error);
    backend.expectOne('/api/me').error(new ProgressEvent('error'));
    const error = (await result) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('maps a 5xx without a code to INTERNAL_ERROR', async () => {
    const error = (await failWith('<html>Bad gateway</html>', 502)) as ApiError;
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('maps a 4xx with an unknown code to UNKNOWN', async () => {
    const error = (await failWith({ code: 'SOMETHING_NEW' }, 400)) as ApiError;
    expect(error.code).toBe('UNKNOWN');
  });

  it('ignores non-object params', async () => {
    const error = (await failWith({ code: 'RATE_LIMITED', params: 'x' }, 429)) as ApiError;
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.params).toEqual({});
  });

  it('passes 304 Not Modified through untouched (ETag polling)', async () => {
    const error = await failWith(null, 304, 'Not Modified');
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(304);
  });
});

describe('error messages', () => {
  const lookup = (json: object, key: string): unknown =>
    key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], json);

  it('maps a code to errors.<CODE>', () => {
    expect(errorKey('NICKNAME_TAKEN')).toBe('errors.NICKNAME_TAKEN');
    expect(errorKey('CITY_NOT_FOUND')).toBe('errors.CITY_NOT_FOUND');
  });

  it('maps unknown codes to errors.UNKNOWN', () => {
    expect(errorKey('NOT_A_CODE')).toBe('errors.UNKNOWN');
    expect(errorKey('')).toBe('errors.UNKNOWN');
  });

  it('maps an ApiError to its key and params, anything else to UNKNOWN', () => {
    expect(errorMessage(new ApiError(429, 'RATE_LIMITED', { retryAfterSec: 12 }))).toEqual({
      key: 'errors.RATE_LIMITED',
      params: { retryAfterSec: 12 },
    });
    expect(errorMessage(new Error('boom'))).toEqual({ key: 'errors.UNKNOWN', params: {} });
  });

  it('covers all 31 API.md §2 codes', () => {
    expect(API_ERROR_CODES).toHaveLength(31);
    expect(new Set(API_ERROR_CODES).size).toBe(31);
  });

  it.each([...API_ERROR_CODES, ...CLIENT_ERROR_CODES])(
    '%s has a Spanish and an English message',
    (code) => {
      const key = errorKey(code);
      expect(key).toBe(`errors.${code}`);
      expect(lookup(es, key)).toEqual(expect.any(String));
      expect(lookup(en, key)).toEqual(expect.any(String));
      expect(lookup(es, key)).not.toBe('');
      expect(lookup(en, key)).not.toBe('');
    },
  );

  it('uses the SPEC §6.3 copy for PROMPT_BLOCKED', () => {
    expect(es.errors.PROMPT_BLOCKED).toBe(
      'Ese prompt no está permitido en este evento. Intenta con otra idea.',
    );
    expect(en.errors.PROMPT_BLOCKED).toBe(
      "That prompt isn't allowed at this event. Try another idea.",
    );
  });
});
