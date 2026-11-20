import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { problemInterceptor } from '../../core/api/problem.interceptor';
import { Attempt, Me } from '../../core/api/api.models';
import {
  MAX_BACKOFF_MS,
  POLL_INTERVAL_MS,
  PlayerStateService,
  backoffDelay,
} from './player-state.service';
import { tokenStorageKey } from './player-token-store';

const TOKEN = 'pt_test_token';

function me(overrides: Partial<Me> = {}): Me {
  return {
    player: { id: 'p1', nickname: 'Ana_dev', claimCode: 'K7QX', city: 'mde', cityName: 'Medellín' },
    phase: 'LOBBY',
    round: null,
    attempts: [],
    final: null,
    ...overrides,
  };
}

function openRound(attempts: Attempt[] = [], entryAttemptId: string | null = null): Me {
  return me({
    phase: 'ROUND_OPEN',
    round: {
      id: 'r1',
      name: 'Café al amanecer',
      scored: true,
      targetUrl: '/img/t.jpg',
      targetThumbUrl: '/img/t_thumb.jpg',
      startedAt: '2026-12-02T15:09:00.000Z',
      endsAt: '2026-12-02T15:17:00.000Z',
      attemptsPerPlayer: 3,
      attemptsLeft: 3,
      entryAttemptId,
    },
    attempts,
  });
}

function attempt(
  id: string,
  status: Attempt['status'],
  queuePosition: number | null = null,
): Attempt {
  return {
    id,
    status,
    prompt: `prompt ${id}`,
    queuePosition,
    imageUrl: status === 'DONE' ? `/img/${id}.jpg` : null,
    thumbUrl: status === 'DONE' ? `/img/${id}_thumb.jpg` : null,
    code: null,
    createdAt: '2026-12-02T15:10:00.000Z',
  };
}

describe('PlayerStateService (PLAN U2)', () => {
  let backend: HttpTestingController;
  let hidden: boolean;

  function setup(token: string | null = TOKEN): PlayerStateService {
    if (token) {
      localStorage.setItem(tokenStorageKey('mde'), token);
    }
    const service = TestBed.inject(PlayerStateService);
    service.start('mde');
    return service;
  }

  /** The pending GET /api/me (after letting promise chains settle). */
  async function poll(): Promise<TestRequest> {
    await vi.advanceTimersByTimeAsync(0);
    return backend.expectOne((req) => req.method === 'GET' && req.url === '/api/me');
  }

  function respond(req: TestRequest, body: Me, etag = 'W/"1"', date = new Date()): void {
    req.flush(body, { headers: { ETag: etag, Date: date.toUTCString() } });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(Date.parse('2026-12-02T15:10:00.000Z'));
    localStorage.clear();
    hidden = false;
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() =>
      hidden ? 'hidden' : 'visible',
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
        PlayerStateService,
      ],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('asks to join when the city has no stored token, and does not poll', async () => {
    const state = setup(null);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.session()).toEqual({ kind: 'join', reason: null });
    expect(state.screen()).toBe('join');
    backend.expectNone('/api/me');
  });

  it('resumes a stored token: polls /api/me with it and shows the phase screen', async () => {
    const state = setup();
    expect(state.screen()).toBe('loading');
    const req = await poll();
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(req.request.headers.has('If-None-Match')).toBe(false);
    respond(req, me());
    await vi.advanceTimersByTimeAsync(0);
    expect(state.screen()).toBe('lobby');
    expect(state.me()?.player.nickname).toBe('Ana_dev');
  });

  it('polls at most every 1.5 s with If-None-Match, and keeps the state on 304', async () => {
    const state = setup();
    respond(await poll(), me(), 'W/"abc"');
    await vi.advanceTimersByTimeAsync(0);
    const before = state.me();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
    backend.expectNone('/api/me');
    await vi.advanceTimersByTimeAsync(1);
    const second = await poll();
    expect(second.request.headers.get('If-None-Match')).toBe('W/"abc"');
    second.flush(null, { status: 304, statusText: 'Not Modified', headers: { ETag: 'W/"abc"' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.me()).toBe(before);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    respond(await poll(), openRound(), 'W/"def"');
    await vi.advanceTimersByTimeAsync(0);
    expect(state.screen()).toBe('round-open');
  });

  it('estimates the server clock offset from the Date header', async () => {
    const state = setup();
    const serverAhead = new Date(Date.now() + 30_000);
    respond(await poll(), me(), 'W/"1"', serverAhead);
    await vi.advanceTimersByTimeAsync(0);
    expect(Math.abs(state.serverOffset() - 30_000)).toBeLessThanOrEqual(1_000);
  });

  it('backs off ×2 up to 10 s on network errors and says the connection is lost', async () => {
    expect([1, 2, 3, 4].map(backoffDelay)).toEqual([3_000, 6_000, MAX_BACKOFF_MS, MAX_BACKOFF_MS]);
    const state = setup();
    respond(await poll(), me());
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    (await poll()).error(new ProgressEvent('error'));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.offline()).toBe(false); // one blip stays quiet

    await vi.advanceTimersByTimeAsync(2_999);
    backend.expectNone('/api/me');
    await vi.advanceTimersByTimeAsync(1);
    (await poll()).flush({ code: 'INTERNAL_ERROR' }, { status: 503, statusText: 'Unavailable' });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.offline()).toBe(true);
    expect(state.screen()).toBe('lobby'); // the last state stays on screen

    await vi.advanceTimersByTimeAsync(5_999);
    backend.expectNone('/api/me');
    await vi.advanceTimersByTimeAsync(1);
    respond(await poll(), me(), 'W/"2"');
    await vi.advanceTimersByTimeAsync(0);
    expect(state.offline()).toBe(false);

    // Back to the normal interval after a success.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    respond(await poll(), me(), 'W/"2"');
  });

  it('forgets the token and asks to join again on 401 (unknown token, event reset)', async () => {
    const state = setup();
    (await poll()).flush(
      { code: 'UNAUTHORIZED', status: 401 },
      { status: 401, statusText: 'Unauthorized' },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(state.session()).toEqual({ kind: 'join', reason: 'UNAUTHORIZED' });
    expect(localStorage.getItem(tokenStorageKey('mde'))).toBeNull();
    await vi.advanceTimersByTimeAsync(20_000);
    backend.expectNone('/api/me');
  });

  it('shows the kicked reason and forgets the token on PLAYER_KICKED', async () => {
    const state = setup();
    (await poll()).flush(
      { code: 'PLAYER_KICKED', status: 403 },
      { status: 403, statusText: 'Forbidden' },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(state.joinReason()).toBe('PLAYER_KICKED');
    expect(localStorage.getItem(tokenStorageKey('mde'))).toBeNull();
  });

  it('never shows another city: a token for a different city asks to join', async () => {
    const state = setup();
    respond(await poll(), me({ player: { ...me().player, city: 'bog', cityName: 'Bogotá' } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.screen()).toBe('join');
  });

  it('pauses while the tab is hidden and polls as soon as it comes back', async () => {
    setup();
    respond(await poll(), me());
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(30_000);
    backend.expectNone('/api/me');

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    respond(await poll(), me());
  });

  it('never polls twice within 1.5 s, whatever asks (retry, online, tab return)', async () => {
    const state = setup();
    respond(await poll(), me());
    await vi.advanceTimersByTimeAsync(500);
    state.retryNow();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    backend.expectNone('/api/me');
    await vi.advanceTimersByTimeAsync(999);
    backend.expectNone('/api/me');
    await vi.advanceTimersByTimeAsync(1);
    respond(await poll(), me());
  });

  it('lets the retry control skip the backoff wait, but not the 1.5 s spacing', async () => {
    const state = setup();
    respond(await poll(), me());
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    (await poll()).error(new ProgressEvent('error')); // next automatic try in 3 s
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    state.retryNow();
    respond(await poll(), me());
  });

  it('joins with the nickname, stores the token per city and loads the state', async () => {
    const state = setup(null);
    const joining = state.join('Ana_dev');
    await vi.advanceTimersByTimeAsync(0);
    const req = backend.expectOne('/api/cities/mde/players');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nickname: 'Ana_dev' });
    req.flush({ playerId: 'p1', token: TOKEN, claimCode: 'K7QX', city: 'mde' });
    respond(await poll(), me());
    expect(await joining).toBeNull();
    expect(localStorage.getItem(tokenStorageKey('mde'))).toBe(TOKEN);
    expect(state.screen()).toBe('lobby');
  });

  it('returns join errors for the form to show', async () => {
    const state = setup(null);
    const joining = state.join('Ana_dev');
    await vi.advanceTimersByTimeAsync(0);
    backend
      .expectOne('/api/cities/mde/players')
      .flush({ code: 'NICKNAME_TAKEN', status: 409 }, { status: 409, statusText: 'Conflict' });
    expect((await joining)?.code).toBe('NICKNAME_TAKEN');
    expect(state.screen()).toBe('join');
  });

  it('shows an accepted prompt as queued until a fresh poll lists it', async () => {
    const state = setup();
    respond(await poll(), openRound());
    await vi.advanceTimersByTimeAsync(0);

    const generating = state.generate('una taza de café');
    expect(state.submitting()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    const post = backend.expectOne('/api/rounds/current/attempts');
    expect(post.request.body).toEqual({ prompt: 'una taza de café' });
    expect(post.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    post.flush({ attemptId: 'a1', queuePosition: 4 }, { status: 202, statusText: 'Accepted' });
    expect(await generating).toBeNull();
    expect(state.submitting()).toBe(false);
    expect(state.generation()).toEqual({ attemptId: 'a1', status: 'QUEUED', queuePosition: 4 });

    // The write triggers a poll as soon as the 1.5 s spacing allows; the server lists the attempt.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    respond(await poll(), openRound([attempt('a1', 'GENERATING')]), 'W/"2"');
    await vi.advanceTimersByTimeAsync(0);
    expect(state.generation()).toEqual({
      attemptId: 'a1',
      status: 'GENERATING',
      queuePosition: null,
    });
  });

  it('drops a poll that started before the player’s own write finished', async () => {
    const state = setup();
    respond(await poll(), openRound([attempt('a1', 'DONE')]));
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    const stale = await poll(); // in flight while the player selects an entry

    const selecting = state.selectEntry('a1');
    expect(state.entryAttemptId()).toBe('a1'); // optimistic
    await vi.advanceTimersByTimeAsync(0);
    backend
      .expectOne('/api/rounds/current/entry')
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await selecting).toBeNull();

    // The old response (no entry yet) must not flip the selection back.
    respond(stale, openRound([attempt('a1', 'DONE')], null), 'W/"old"');
    await vi.advanceTimersByTimeAsync(0);
    expect(state.entryAttemptId()).toBe('a1');

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    const fresh = await poll();
    expect(fresh.request.headers.get('If-None-Match')).toBe('W/"1"');
    respond(fresh, openRound([attempt('a1', 'DONE')], 'a1'), 'W/"new"');
    await vi.advanceTimersByTimeAsync(0);
    expect(state.entryAttemptId()).toBe('a1');
    expect(state.entryPending()).toBe(false);
  });

  it('reverts an optimistic entry and returns the error when selection fails', async () => {
    const state = setup();
    respond(await poll(), openRound([attempt('a1', 'DONE')]));
    const selecting = state.selectEntry('a1');
    await vi.advanceTimersByTimeAsync(0);
    backend
      .expectOne('/api/rounds/current/entry')
      .flush({ code: 'ROUND_NOT_OPEN', status: 409 }, { status: 409, statusText: 'Conflict' });
    expect((await selecting)?.code).toBe('ROUND_NOT_OPEN');
    expect(state.entryAttemptId()).toBeNull();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    respond(await poll(), openRound([attempt('a1', 'DONE')]), 'W/"2"');
  });

  it('ends the session when a write gets 401', async () => {
    const state = setup();
    respond(await poll(), openRound());
    const generating = state.generate('hola');
    await vi.advanceTimersByTimeAsync(0);
    backend
      .expectOne('/api/rounds/current/attempts')
      .flush({ code: 'UNAUTHORIZED', status: 401 }, { status: 401, statusText: 'Unauthorized' });
    expect(await generating).toBeNull();
    expect(state.session()).toEqual({ kind: 'join', reason: 'UNAUTHORIZED' });
  });
});
