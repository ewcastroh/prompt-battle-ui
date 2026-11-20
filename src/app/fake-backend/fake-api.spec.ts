import { FakeApi, FakeRequest, FakeResponse } from './fake-api';
import { Me, RoundDefinition, StageState } from '../core/api/api.models';

const ADMIN = 'fake-admin-token-mde-0123456789';

describe('FakeApi (docs/API.md, dev only)', () => {
  let now: number;
  let api: FakeApi;

  beforeEach(() => {
    now = Date.parse('2026-12-02T15:00:00.000Z');
    api = new FakeApi(() => now);
  });

  function call(
    method: string,
    path: string,
    body: unknown = null,
    headers: Record<string, string> = {},
  ): FakeResponse {
    const url = new URL(path, 'http://fake.test');
    const request: FakeRequest = {
      method,
      path: url.pathname,
      query: url.searchParams,
      headers: { get: (name) => headers[name] ?? null },
      body,
    };
    return api.handle(request);
  }

  it('returns ProblemDetail errors with a code', () => {
    const response = call('POST', '/api/cities/xyz/players', { nickname: 'Ana' });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      status: 404,
      code: 'CITY_NOT_FOUND',
      params: { city: 'xyz' },
    });
  });

  it('plays join → generate → submit → close → scored for one city only', () => {
    const join = call('POST', '/api/cities/mde/players', { nickname: 'Ana_dev' });
    expect(join.status).toBe(201);
    const auth = { Authorization: `Bearer ${(join.body as { token: string }).token}` };

    const rounds = call('GET', '/api/admin/rounds', null, { 'X-Admin-Token': ADMIN })
      .body as RoundDefinition[];
    const scored = rounds.find((r) => r.scored)!;
    expect(
      call('POST', `/api/admin/rounds/${scored.id}/start`, null, { 'X-Admin-Token': ADMIN }).status,
    ).toBe(200);

    const created = call(
      'POST',
      '/api/rounds/current/attempts',
      { prompt: '  una taza   de café [sim=0.9] ' },
      auth,
    );
    expect(created.status).toBe(202);
    const attemptId = (created.body as { attemptId: string }).attemptId;
    expect(
      call('POST', '/api/rounds/current/attempts', { prompt: 'otra' }, auth).body,
    ).toMatchObject({
      code: 'GENERATION_IN_FLIGHT',
    });

    now += 3000;
    const me = call('GET', '/api/me', null, auth);
    expect((me.body as Me).attempts[0]).toMatchObject({
      id: attemptId,
      status: 'DONE',
      prompt: 'una taza de café [sim=0.9]',
    });
    expect((me.body as Me).round?.attemptsLeft).toBe(2);

    // ETag → 304 on an unchanged body.
    const etag = me.headers['ETag'];
    expect(call('GET', '/api/me', null, { ...auth, 'If-None-Match': etag }).status).toBe(304);

    expect(call('POST', '/api/rounds/current/entry', { attemptId }, auth).status).toBe(204);
    call('POST', `/api/admin/rounds/${scored.id}/close`, null, { 'X-Admin-Token': ADMIN });
    expect((call('GET', '/api/me', null, auth).body as Me).phase).toBe('ROUND_CLOSING');

    now += 2500;
    expect((call('GET', '/api/me', null, auth).body as Me).phase).toBe('ROUND_SCORED');
    const bog = call('GET', '/api/cities/bog/stage/state').body as StageState;
    expect(bog.phase).toBe('LOBBY');
    expect(bog.playersCount).toBe(0);
  });

  it('rejects admin calls without a valid token', () => {
    expect(call('GET', '/api/admin/state').body).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });
});
