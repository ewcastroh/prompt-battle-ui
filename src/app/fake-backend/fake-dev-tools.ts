import { tokenStorageKey } from '../features/player/player-token-store';
import { FAKE_ADMIN_TOKENS, FakeApi, FakeRequest, FakeResponse } from './fake-api';
import { hashString } from './fake-images';
import {
  FIXTURE_DATA,
  FIXTURE_SCREENS,
  FIXTURE_TOKEN,
  FixtureData,
  FixtureScreen,
  fixtureMe,
  isFixtureData,
  isFixtureScreen,
} from './fake-fixtures';

/**
 * Dev-only tools around the in-browser fake API (`ng serve -c fake`; never in production builds):
 *
 * - **Fixtures** (`/play/<city>?fixture=<screen>&data=demo|worst`): player endpoints answer from a
 *   fixed state (fake-fixtures.ts) so every screen can be reviewed and screenshotted, including the
 *   worst-case data.
 * - **Toolbar** (`?dev`): a "Demo data / Worst case" switch, a screen picker and an offline toggle,
 *   fixed at the bottom of the page.
 * - **Test hook** (`window.__pbFake`): admin actions and the offline switch for Playwright.
 */

/** Simulated network failure for every `/api` request while true. */
export const fakeControls = { offline: false };

let api: FakeApi | null = null;

/** The page's fake API (one per page load). */
export function fakeApi(): FakeApi {
  return (api ??= new FakeApi());
}

interface FixtureMode {
  screen: FixtureScreen;
  data: FixtureData;
  epoch: number;
}

let fixtureMode: FixtureMode | null | undefined;

function readFixtureMode(): FixtureMode | null {
  if (fixtureMode !== undefined) {
    return fixtureMode;
  }
  const params = new URLSearchParams(location.search);
  const screen = params.get('fixture');
  const data = params.get('data') ?? 'demo';
  fixtureMode =
    isFixtureScreen(screen) && isFixtureData(data) ? { screen, data, epoch: Date.now() } : null;
  return fixtureMode;
}

const PLAYER_PATH =
  /^\/api\/(me|rounds\/current\/(attempts|entry)|attempts\/[^/]+|cities\/[^/]+\/players)$/;

/**
 * Answers a player request from the active fixture, or returns `null` to let the fake API answer
 * (no fixture, or not a player endpoint).
 */
export function fixtureResponse(req: FakeRequest): FakeResponse | null {
  const mode = readFixtureMode();
  if (!mode || !PLAYER_PATH.test(req.path)) {
    return null;
  }
  const date = new Date().toUTCString();
  const problem = (status: number, code: string): FakeResponse => ({
    status,
    body: { type: 'about:blank', title: 'Fixture', status, code, params: {} },
    headers: { 'Content-Type': 'application/problem+json', Date: date },
  });
  const city = cityOf(req.path) ?? currentCity() ?? 'mde';
  const cityName = fakeApi().cityName(city) ?? city;

  if (req.method === 'POST' && req.path.endsWith('/players')) {
    return {
      status: 201,
      body: { playerId: 'fx-player', token: FIXTURE_TOKEN, claimCode: 'K7QX', city },
      headers: { Date: date },
    };
  }
  if (!req.headers.get('Authorization')?.startsWith('Bearer ')) {
    return problem(401, 'UNAUTHORIZED');
  }
  if (req.method === 'GET' && req.path === '/api/me') {
    const fixture = fixtureMe(mode.screen, mode.data, { code: city, name: cityName }, mode.epoch);
    if (fixture.kind === 'error') {
      return problem(fixture.status, fixture.code);
    }
    const etag = `W/"${hashString(JSON.stringify(fixture.me)).toString(16)}"`;
    if (req.headers.get('If-None-Match') === etag) {
      return { status: 304, body: null, headers: { ETag: etag, Date: date } };
    }
    return {
      status: 200,
      body: fixture.me,
      headers: { ETag: etag, 'Cache-Control': 'private, no-cache', Date: date },
    };
  }
  if (req.method === 'POST' && req.path === '/api/rounds/current/attempts') {
    return {
      status: 202,
      body: { attemptId: 'fx-attempt-new', queuePosition: 3 },
      headers: { Date: date },
    };
  }
  if (req.method === 'POST' && req.path === '/api/rounds/current/entry') {
    return { status: 204, body: null, headers: { Date: date } };
  }
  return problem(404, 'ATTEMPT_NOT_FOUND');
}

function cityOf(path: string): string | null {
  return /^\/api\/cities\/([^/]+)\//.exec(path)?.[1] ?? null;
}

function currentCity(): string | null {
  return /\/play\/([^/?#]+)/.exec(location.pathname)?.[1] ?? null;
}

// ------------------------------------------------------------------ test hook

export interface FakeHook {
  /** Calls an admin endpoint as the city's admin. */
  admin(city: string, method: string, path: string, body?: unknown): FakeResponse;
  /** Starts the city's first not-yet-run round of the given kind and returns its id. */
  startRound(city: string, options?: { scored?: boolean }): string;
  /** Closes the city's open round. */
  closeRound(city: string): void;
  /** Makes every `/api` request fail like a dropped connection. */
  setOffline(offline: boolean): void;
}

function adminToken(city: string): string {
  const token = Object.entries(FAKE_ADMIN_TOKENS).find(([, code]) => code === city)?.[0];
  if (!token) {
    throw new Error(`No fake admin token for city "${city}"`);
  }
  return token;
}

const hook: FakeHook = {
  admin(city, method, path, body = null) {
    const url = new URL(path, location.origin);
    const token = adminToken(city);
    return fakeApi().handle({
      method,
      path: url.pathname,
      query: url.searchParams,
      headers: { get: (name) => (name === 'X-Admin-Token' ? token : null) },
      body,
    });
  },
  startRound(city, options = {}) {
    const scored = options.scored ?? true;
    const rounds = hook.admin(city, 'GET', '/api/admin/rounds').body as {
      id: string;
      scored: boolean;
      runs: { city: string; status: string }[];
    }[];
    const round = rounds.find(
      (candidate) =>
        candidate.scored === scored &&
        candidate.runs.some((run) => run.city === city && run.status === 'NOT_STARTED'),
    );
    if (!round) {
      throw new Error(`No ${scored ? 'scored' : 'practice'} round left to start in ${city}`);
    }
    const started = hook.admin(city, 'POST', `/api/admin/rounds/${round.id}/start`);
    if (started.status !== 200) {
      throw new Error(`Start failed: ${JSON.stringify(started.body)}`);
    }
    return round.id;
  },
  closeRound(city) {
    const state = hook.admin(city, 'GET', '/api/admin/state').body as {
      round: { id: string } | null;
    };
    if (!state.round) {
      throw new Error(`No round to close in ${city}`);
    }
    hook.admin(city, 'POST', `/api/admin/rounds/${state.round.id}/close`);
  },
  setOffline(offline) {
    fakeControls.offline = offline;
  },
};

// ------------------------------------------------------------------ startup

/** Runs before routing (fake build only): fixture token, test hook and the optional toolbar. */
export function installFakeDevTools(): void {
  (window as unknown as { __pbFake: FakeHook }).__pbFake = hook;
  const mode = readFixtureMode();
  const city = currentCity();
  if (mode && city) {
    try {
      if (mode.screen === 'join') {
        localStorage.removeItem(tokenStorageKey(city));
      } else {
        localStorage.setItem(tokenStorageKey(city), FIXTURE_TOKEN);
      }
    } catch {
      // Storage blocked: the fixture still answers, the player starts on the join form.
    }
  }
  if (new URLSearchParams(location.search).has('dev')) {
    renderToolbar(mode);
  }
}

/** "Demo data / Worst case" toolbar (break-ui): plain DOM, dev chrome only, never shipped. */
function renderToolbar(mode: FixtureMode | null): void {
  const bar = document.createElement('div');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Dev fixtures');
  bar.style.cssText = [
    'position:fixed',
    'inset-block-end:max(8px, env(safe-area-inset-bottom, 0px))',
    'inset-inline-start:50%',
    'translate:-50% 0',
    'z-index:100',
    'display:flex',
    'flex-wrap:wrap',
    'gap:6px',
    'align-items:center',
    'max-inline-size:calc(100vw - 16px)',
    'padding:6px',
    'border-radius:12px',
    'background:#d4d4d8',
    'color:#18181b',
    'font:13px system-ui, sans-serif',
    'box-shadow:0 2px 8px rgb(0 0 0 / 0.25)',
  ].join(';');

  const go = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    location.search = params.toString();
  };

  for (const data of FIXTURE_DATA) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = data === 'demo' ? 'Demo data' : 'Worst case';
    const active = (mode?.data ?? 'demo') === data;
    button.setAttribute('aria-pressed', String(active));
    button.style.cssText = `min-height:44px;padding:0 12px;border:0;border-radius:8px;cursor:pointer;background:${
      active ? '#ffffff' : 'transparent'
    };color:#18181b;font:inherit;font-weight:600`;
    button.addEventListener('click', () =>
      go({ data, fixture: mode?.screen ?? 'round-open', dev: '' }),
    );
    bar.append(button);
  }

  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Screen');
  select.style.cssText = 'min-height:44px;border-radius:8px;font:inherit';
  for (const value of ['live', ...FIXTURE_SCREENS]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    option.selected = (mode?.screen ?? 'live') === value;
    select.append(option);
  }
  select.addEventListener('change', () =>
    go(select.value === 'live' ? { fixture: null, data: null } : { fixture: select.value }),
  );
  bar.append(select);

  const offline = document.createElement('label');
  offline.style.cssText =
    'display:inline-flex;gap:4px;align-items:center;min-height:44px;padding:0 8px';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.addEventListener('change', () => hook.setOffline(box.checked));
  offline.append(box, 'Offline');
  bar.append(offline);

  document.body.append(bar);
}
