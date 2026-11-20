import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { problemInterceptor } from '../../core/api/problem.interceptor';
import { AdminSessionService } from './admin-session.service';
import { adminTokenKey } from './admin-token-store';

const TOKEN = 'admin-token-for-tests-000001';

describe('admin session (SPEC §10.1, D-020 #9)', () => {
  let session: AdminSessionService;
  let backend: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        AdminSessionService,
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    session = TestBed.inject(AdminSessionService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  function answerMe(city: string, cityName: string) {
    const request = backend.expectOne('/api/admin/me');
    expect(request.request.headers.get('X-Admin-Token')).toBe(TOKEN);
    request.flush({ city, cityName });
  }

  it('shows the login form when the city has no stored token', async () => {
    await session.start('mde');
    expect(session.session()).toEqual({ kind: 'login', reason: null });
  });

  it('signs in when the token belongs to the route city, and stores it per city', async () => {
    await session.start('mde');
    const login = session.login(`  ${TOKEN} `);
    answerMe('mde', 'Medellín');
    expect(await login).toBeNull();
    expect(session.session()).toEqual({ kind: 'ready', city: 'mde', cityName: 'Medellín' });
    expect(session.token()).toBe(TOKEN);
    expect(localStorage.getItem(adminTokenKey('mde'))).toBe(TOKEN);
  });

  it("refuses another city's token: not signed in, nothing stored", async () => {
    await session.start('mde');
    const login = session.login(TOKEN);
    answerMe('bog', 'Bogotá');
    expect(await login).toEqual({
      kind: 'city-mismatch',
      tokenCity: 'bog',
      tokenCityName: 'Bogotá',
    });
    expect(session.ready()).toBe(false);
    expect(session.token()).toBeNull();
    expect(localStorage.getItem(adminTokenKey('mde'))).toBeNull();
  });

  it('rechecks a stored token on load, and drops it when it no longer works', async () => {
    localStorage.setItem(adminTokenKey('mde'), TOKEN);
    const start = session.start('mde');
    expect(session.session().kind).toBe('checking');
    backend
      .expectOne('/api/admin/me')
      .flush(
        { status: 401, code: 'UNAUTHORIZED', title: 'Unauthorized', type: 'about:blank' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await start;
    expect(session.session()).toEqual({ kind: 'login', reason: 'UNAUTHORIZED' });
    expect(localStorage.getItem(adminTokenKey('mde'))).toBeNull();
  });

  it('keeps a stored token through a network error and tries again (venue Wi-Fi)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      localStorage.setItem(adminTokenKey('mde'), TOKEN);
      const start = session.start('mde');
      backend.expectOne('/api/admin/me').error(new ProgressEvent('error'));
      await vi.advanceTimersByTimeAsync(0);
      expect(session.session()).toEqual({ kind: 'checking', retrying: true });
      expect(localStorage.getItem(adminTokenKey('mde'))).toBe(TOKEN);

      await vi.advanceTimersByTimeAsync(1000);
      answerMe('mde', 'Medellín');
      await start;
      expect(session.session()).toEqual({ kind: 'ready', city: 'mde', cityName: 'Medellín' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a 401 elsewhere ends the session; logging out forgets the token', async () => {
    localStorage.setItem(adminTokenKey('mde'), TOKEN);
    const start = session.start('mde');
    answerMe('mde', 'Medellín');
    await start;
    session.expired();
    expect(session.session()).toEqual({ kind: 'login', reason: 'UNAUTHORIZED' });
    expect(localStorage.getItem(adminTokenKey('mde'))).toBeNull();
  });
});
