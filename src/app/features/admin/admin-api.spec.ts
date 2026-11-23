import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { problemInterceptor } from '../../core/api/problem.interceptor';
import { AdminState } from '../../core/api/api.models';
import { AdminApi, filenameFrom } from './admin-api';
import { AdminSessionService } from './admin-session.service';
import { AdminStateService } from './admin-state.service';
import { mergeAlerts } from './alerts/admin-alerts';
import { nextStep } from './control/admin-control';
import { uploadProblem } from './rounds/round-form';

const TOKEN = 'admin-token-for-tests-000001';

function adminState(overrides: Partial<AdminState> = {}): AdminState {
  return {
    city: 'mde',
    phase: 'PODIUM_REVEAL',
    playersCount: 8,
    scoredRoundsDone: 2,
    round: null,
    miniPodium: null,
    podium: { roundId: null, size: 5, step: 1, preview: [] },
    practiceGalleryShown: false,
    ...overrides,
  };
}

describe('admin helpers', () => {
  it('reads the file name from Content-Disposition', () => {
    expect(filenameFrom('attachment; filename="results-mde.csv"', 'x.csv')).toBe('results-mde.csv');
    expect(filenameFrom("attachment; filename*=UTF-8''results%20bog.csv", 'x.csv')).toBe(
      'results bog.csv',
    );
    expect(filenameFrom(null, 'results-mde.csv')).toBe('results-mde.csv');
  });

  it('labels the big Next with the rank it reveals, and finishes after #1', () => {
    expect(
      nextStep('PODIUM_REVEAL', { roundId: null, size: 5, step: 0, preview: [] }),
    ).toMatchObject({
      kind: 'podium/next',
      rank: 5,
      enabled: true,
    });
    expect(
      nextStep('PODIUM_REVEAL', { roundId: null, size: 5, step: 5, preview: [] }),
    ).toMatchObject({
      labelKey: 'admin.control.showPrompts',
      enabled: true,
    });
    expect(nextStep('MINI_PODIUM', { roundId: 'r1', size: 3, step: 3, preview: [] })).toMatchObject(
      {
        kind: 'mini-podium/next',
        enabled: false,
      },
    );
    // A podium preview (before podium/start) has no step: nothing to reveal yet.
    expect(nextStep('LOBBY', { roundId: null, size: 5, step: null, preview: [] })).toBeNull();
  });

  it('checks uploads before sending them (JPEG or PNG, ≤ 10 MB)', () => {
    const file = (type: string, size: number) =>
      new File([new Uint8Array(size)], 'target', { type });
    expect(uploadProblem(null)).toBe('admin.roundForm.uploadMissing');
    expect(uploadProblem(file('image/webp', 10))).toBe('admin.roundForm.uploadType');
    expect(uploadProblem(file('image/png', 10 * 1024 * 1024 + 1))).toBe(
      'admin.roundForm.uploadSize',
    );
    expect(uploadProblem(file('image/jpeg', 1024))).toBeNull();
  });

  it('merges alerts newest first without duplicates', () => {
    const alert = (id: string, at: string) => ({
      id,
      at,
      code: 'CIRCUIT_OPEN' as const,
      city: null,
      params: {},
    });
    const merged = mergeAlerts(
      [alert('b', '2026-12-02T15:00:01.000Z'), alert('a', '2026-12-02T15:00:00.000Z')],
      [alert('c', '2026-12-02T15:00:02.000Z'), alert('b', '2026-12-02T15:00:01.000Z')],
    );
    expect(merged.map((a) => a.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('admin API and run actions', () => {
  let backend: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        AdminSessionService,
        AdminApi,
        AdminStateService,
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    const session = TestBed.inject(AdminSessionService);
    await session.start('mde');
    const login = session.login(TOKEN);
    backend.expectOne('/api/admin/me').flush({ city: 'mde', cityName: 'Medellín' });
    await login;
  });

  afterEach(() => backend.verify());

  it('downloads the results CSV with the admin token and the server file name', async () => {
    const download = TestBed.inject(AdminApi).resultsCsv('mde');
    const request = backend.expectOne('/api/admin/results.csv');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('X-Admin-Token')).toBe(TOKEN);
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['city,rank\n'], { type: 'text/csv' }), {
      headers: { 'Content-Disposition': 'attachment; filename="results-mde.csv"' },
    });
    const file = await download;
    expect(file.filename).toBe('results-mde.csv');
    expect(await file.blob.text()).toBe('city,rank\n');
  });

  it('sends the uploaded target as multipart: a JSON `round` part and a `target` file', async () => {
    const target = new File([new Uint8Array(8)], 'cafe.png', { type: 'image/png' });
    const save = TestBed.inject(AdminApi).saveRound(
      null,
      {
        name: 'Café',
        hiddenPrompt: 'a cup',
        durationSec: 480,
        attemptsPerPlayer: 3,
        scored: true,
        seed: null,
      },
      target,
    );
    const request = backend.expectOne('/api/admin/rounds');
    const body = request.request.body as FormData;
    expect(JSON.parse(body.get('round') as string)).toEqual({
      name: 'Café',
      hiddenPrompt: 'a cup',
      durationSec: 480,
      attemptsPerPlayer: 3,
      scored: true,
      seed: null,
    });
    expect((body.get('target') as File).name).toBe('cafe.png');
    request.flush({ id: 'r1' }, { status: 201, statusText: 'Created' });
    await save;
  });

  it('runs one action at a time: a double-tapped Next posts once and reveals one step', async () => {
    const live = TestBed.inject(AdminStateService);
    const first = live.act({ kind: 'podium/next' });
    const second = live.act({ kind: 'podium/next' });
    expect(await second).toBeNull();
    const requests = backend.match('/api/admin/podium/next');
    expect(requests).toHaveLength(1);
    requests[0].flush(adminState({ podium: { roundId: null, size: 5, step: 2, preview: [] } }));
    expect(await first).toBeNull();
    expect(live.state()?.podium?.step).toBe(2);
    expect(live.busy()).toBeNull();
  });

  it('returns the error of a refused action and frees the controls', async () => {
    const live = TestBed.inject(AdminStateService);
    const result = live.act({ kind: 'podium/next' });
    backend.expectOne('/api/admin/podium/next').flush(
      {
        status: 409,
        code: 'INVALID_TRANSITION',
        params: { phase: 'LOBBY' },
        title: 'x',
        type: 'about:blank',
      },
      { status: 409, statusText: 'Conflict' },
    );
    expect((await result)?.code).toBe('INVALID_TRANSITION');
    expect(live.busy()).toBeNull();
  });
});
