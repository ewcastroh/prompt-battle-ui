import {
  APIRequestContext,
  Browser,
  BrowserContext,
  Page,
  expect,
  request,
  test,
} from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import en from '../../public/i18n/en.json';
import es from '../../public/i18n/es.json';
import { Copy, fill } from '../support';

/**
 * A full two-city event on the Compose stack (PLAN I1 step 4): two stages, two admin consoles and
 * a few players per city, against the real API on the `fake` profile. Every action goes through the
 * real UI (admin and player screens); the API is only read to wait for state, and to drive a few
 * extra HTTP "bot" players. Medellín runs in Spanish/light, Bogotá in English/dark.
 */

const UI = (process.env['PB_UI_URL'] ?? 'http://localhost:4200').replace(/\/+$/, '');
const API = (process.env['PB_API_URL'] ?? 'http://localhost:8080').replace(/\/+$/, '');
const SHOTS = 'e2e/screenshots/compose';

type City = 'mde' | 'bog';
const CITIES: readonly City[] = ['mde', 'bog'];
const COPY: Record<City, Copy> = { mde: es, bog: en as Copy };
const LANG: Record<City, 'es' | 'en'> = { mde: 'es', bog: 'en' };
const SCHEME: Record<City, 'light' | 'dark'> = { mde: 'light', bog: 'dark' };

function token(city: City): string {
  const value = process.env[`PB_ADMIN_TOKEN_${city.toUpperCase()}`];
  if (!value) {
    throw new Error(`Set PB_ADMIN_TOKEN_${city.toUpperCase()} (the API's ADMIN_TOKEN_*)`);
  }
  return value;
}

const PRACTICE = 'Práctica: gato dormido';
const ROUND_1 = 'Café al amanecer';
const ROUND_2 = 'Chiva bajo la lluvia';

/** Phone players (browser) and bots (HTTP) per city, with the cosine each one's prompts score. */
const PHONES: Record<City, { nickname: string; sim: [number, number] }[]> = {
  mde: [
    { nickname: 'Ana_dev', sim: [0.91, 0.62] },
    { nickname: 'Pixel_Paisa', sim: [0.74, 0.88] },
  ],
  bog: [
    { nickname: 'Rolo_Uno', sim: [0.83, 0.79] },
    { nickname: 'Sabana_Fria', sim: [0.57, 0.93] },
  ],
};
const BOTS: Record<City, { nickname: string; sim: [number, number] }[]> = {
  mde: [
    { nickname: 'Bot_Mde_1', sim: [0.66, 0.71] },
    { nickname: 'Bot_Mde_2', sim: [0.49, 0.55] },
  ],
  bog: [
    { nickname: 'Bot_Bog_1', sim: [0.72, 0.64] },
    { nickname: 'Bot_Bog_2', sim: [0.61, 0.58] },
  ],
};

// ------------------------------------------------------------------ API (reads and bots)

interface AdminState {
  phase: string;
  podium: { size: number; step: number | null } | null;
  miniPodium: { size: number; step: number | null } | null;
}

async function admin<T>(
  api: APIRequestContext,
  city: City,
  method: string,
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await api.fetch(`${API}${path}`, {
    method,
    headers: { 'X-Admin-Token': token(city) },
    data,
  });
  expect(response.status(), `${method} ${path} (${city})`).toBeLessThan(400);
  return (response.status() === 204 ? null : await response.json()) as T;
}

const state = (api: APIRequestContext, city: City) =>
  admin<AdminState>(api, city, 'GET', '/api/admin/state');

async function waitPhase(api: APIRequestContext, city: City, phase: string, timeout = 60_000) {
  await expect
    .poll(async () => (await state(api, city)).phase, { timeout, message: `${city} → ${phase}` })
    .toBe(phase);
}

/** An HTTP-only player: join, then one attempt per round, submitted as the entry. */
class Bot {
  private token = '';
  constructor(
    readonly city: City,
    readonly nickname: string,
  ) {}

  async join(api: APIRequestContext): Promise<void> {
    const response = await api.post(`${API}/api/cities/${this.city}/players`, {
      data: { nickname: this.nickname },
    });
    expect(response.status(), `bot join ${this.nickname}`).toBe(201);
    this.token = (await response.json()).token;
  }

  async play(api: APIRequestContext, prompt: string): Promise<void> {
    const headers = { Authorization: `Bearer ${this.token}` };
    const created = await api.post(`${API}/api/rounds/current/attempts`, {
      headers,
      data: { prompt },
    });
    expect(created.status(), `bot attempt ${this.nickname}`).toBe(202);
    const { attemptId } = await created.json();
    await expect
      .poll(
        async () => {
          const me = await (await api.get(`${API}/api/me`, { headers })).json();
          return me.attempts.find((a: { id: string }) => a.id === attemptId)?.status;
        },
        { timeout: 30_000, message: `bot attempt ${this.nickname} done` },
      )
      .toBe('DONE');
    const entry = await api.post(`${API}/api/rounds/current/entry`, {
      headers,
      data: { attemptId },
    });
    expect(entry.status(), `bot entry ${this.nickname}`).toBe(204);
  }
}

// ------------------------------------------------------------------ browser helpers

/** Every API response ≥ 400 and every console error, per page, so contract breaks fail the run. */
const problems: string[] = [];

function watch(page: Page, label: string): Page {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(`${label} console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`${label} pageerror: ${error.message}`));
  page.on('requestfailed', (req) => {
    // Polls cancelled by navigation or a newer poll are not failures.
    if (req.failure()?.errorText !== 'net::ERR_ABORTED') {
      problems.push(
        `${label} requestfailed: ${req.method()} ${req.url()} ${req.failure()?.errorText}`,
      );
    }
  });
  page.on('response', (response) => {
    if (response.url().startsWith(API) && response.status() >= 400) {
      problems.push(
        `${label} ${response.status()}: ${response.request().method()} ${response.url()}`,
      );
    }
  });
  return page;
}

async function open(
  browser: Browser,
  city: City,
  kind: 'stage' | 'admin' | 'phone',
  label: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const viewport =
    kind === 'stage'
      ? { width: 1920, height: 1080 }
      : kind === 'admin'
        ? { width: 1366, height: 900 }
        : { width: 360, height: 800 };
  const context = await browser.newContext({
    viewport,
    colorScheme: SCHEME[city],
    locale: LANG[city] === 'es' ? 'es-CO' : 'en-US',
    isMobile: kind === 'phone',
    hasTouch: kind === 'phone',
    deviceScaleFactor: kind === 'phone' ? 2 : 1,
    storageState: {
      cookies: [],
      origins: [{ origin: UI, localStorage: [{ name: 'lang', value: LANG[city] }] }],
    },
  });
  return { context, page: watch(await context.newPage(), label) };
}

/** Two-digit screenshot prefix, so files sort in event order. */
const nn = (n: number) => String(n).padStart(2, '0');

async function shot(page: Page, name: string, settle = 2_000): Promise<void> {
  // Stage and phones poll every 1.5 s; the podium score counts up over ~1.5 s.
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function signIn(page: Page, city: City): Promise<void> {
  const t = COPY[city];
  await page.goto(`${UI}/admin/${city}`);
  await page.getByLabel(t.admin.login.label).fill(token(city));
  await page.getByRole('button', { name: t.admin.login.submit }).click();
  await expect(page.getByRole('heading', { name: t.admin.control.title })).toBeVisible();
}

async function createRound(
  page: Page,
  city: City,
  round: { name: string; hidden: string; scored: boolean; upload?: string },
): Promise<void> {
  const t = COPY[city];
  await page.getByRole('button', { name: t.admin.rounds.new }).click();
  const dialog = page.getByRole('dialog', { name: t.admin.roundForm.newTitle });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(t.admin.roundForm.name).fill(round.name);
  await dialog
    .getByRole('radio', { name: round.scored ? t.admin.rounds.scored : t.admin.rounds.practice })
    .check();
  await dialog.getByLabel(t.admin.roundForm.hiddenPrompt).fill(round.hidden);
  await dialog.getByLabel(t.admin.roundForm.duration).fill(round.scored ? '480' : '180');
  if (round.upload) {
    await dialog.getByRole('radio', { name: t.admin.roundForm.upload }).check();
    await dialog.getByLabel(t.admin.roundForm.file).setInputFiles(round.upload);
  } else {
    await dialog.getByRole('radio', { name: t.admin.roundForm.generate }).check();
    await dialog.getByRole('button', { name: t.admin.roundForm.generateButton }).click();
    await expect(dialog.getByRole('img', { name: t.admin.roundForm.previewAlt })).toBeVisible();
  }
  await dialog.getByRole('button', { name: t.admin.roundForm.create }).click();
  await expect(dialog).toBeHidden();
}

async function startNext(page: Page, city: City, name: string): Promise<void> {
  const t = COPY[city];
  await page.getByRole('button', { name: fill(t.admin.control.start, { name }) }).click();
  await expect(page.locator('pb-admin-control .summary')).toContainText(t.admin.phase.ROUND_OPEN);
}

async function closeRound(page: Page, city: City): Promise<void> {
  const t = COPY[city];
  await page.getByRole('button', { name: t.admin.control.close }).click();
  const dialog = page.getByRole('dialog', { name: t.admin.control.closeTitle });
  await dialog.getByRole('button', { name: t.admin.control.close }).click();
  await expect(dialog).toBeHidden();
}

async function clickNext(page: Page, city: City): Promise<void> {
  await page.getByRole('button', { name: new RegExp(COPY[city].admin.control.next) }).click();
}

async function joinPhone(page: Page, city: City, nickname: string): Promise<void> {
  const t = COPY[city];
  await page.goto(`${UI}/play/${city}`);
  await page.getByLabel(t.player.join.nicknameLabel).fill(nickname);
  await page.getByRole('button', { name: t.player.join.submit }).click();
  await expect(page.locator('#player-title')).toHaveText(fill(t.player.title.lobby, { nickname }));
}

async function playPhone(page: Page, city: City, roundName: string, prompt: string) {
  const t = COPY[city];
  await expect(page.locator('#player-title')).toHaveText(roundName);
  await page.getByLabel(t.player.round.editor.label).fill(prompt);
  await page.getByRole('button', { name: t.player.round.generate.label, exact: true }).click();
  const submit = page.getByRole('button', {
    name: new RegExp(`^${t.player.round.attempt.submit}`),
  });
  await expect(submit).toBeVisible({ timeout: 30_000 });
  await submit.click();
  await expect(
    page.getByRole('button', { name: new RegExp(`^${t.player.round.attempt.selected}`) }),
  ).toBeVisible();
}

// ------------------------------------------------------------------ the event

test('a full two-city event on the Compose stack', async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  mkdirSync(SHOTS, { recursive: true });
  const api = await request.newContext();

  // A clean event (also proves the reset endpoint and its confirmation body).
  await admin(api, 'mde', 'POST', '/api/admin/event/reset', { confirm: 'RESET' });
  const cities = await (await api.get(`${API}/api/cities`)).json();
  expect(cities.map((c: { code: string }) => c.code)).toEqual(['mde', 'bog']);

  const pages = {} as Record<City, { stage: Page; admin: Page; phones: Page[]; bots: Bot[] }>;
  for (const city of CITIES) {
    const adminPage = (await open(browser, city, 'admin', `admin-${city}`)).page;
    const stage = (await open(browser, city, 'stage', `stage-${city}`)).page;
    const phones: Page[] = [];
    for (const phone of PHONES[city]) {
      phones.push((await open(browser, city, 'phone', `phone-${phone.nickname}`)).page);
    }
    pages[city] = {
      stage,
      admin: adminPage,
      phones,
      bots: BOTS[city].map((b) => new Bot(city, b.nickname)),
    };
    await signIn(adminPage, city);
  }

  // ---- Rounds (shared): practice and round 1 generated from a prompt in Medellín; round 2 is an
  // uploaded target created in Bogotá (multipart).
  await createRound(pages.mde.admin, 'mde', {
    name: PRACTICE,
    hidden: 'a sleeping cat on a sunny windowsill, watercolor [target]',
    scored: false,
  });
  await createRound(pages.mde.admin, 'mde', {
    name: ROUND_1,
    hidden: 'a steaming cup of coffee at dawn in a small Antioquia town, watercolor [target]',
    scored: true,
  });
  const rounds = await admin<{ name: string; targetUrl: string }[]>(
    api,
    'bog',
    'GET',
    '/api/admin/rounds',
  );
  const upload = test.info().outputPath('uploaded-target.jpg');
  const image = await api.get(`${API}${rounds.find((r) => r.name === ROUND_1)!.targetUrl}`);
  writeFileSync(upload, await image.body());
  await createRound(pages.bog.admin, 'bog', {
    name: ROUND_2,
    hidden: 'a colorful chiva bus in the rain on a mountain road, oil painting',
    scored: true,
    upload,
  });
  await expect
    .poll(
      async () =>
        (
          await admin<{ calibration: { status: string } }[]>(api, 'mde', 'GET', '/api/admin/rounds')
        ).map((r) => r.calibration.status),
      { timeout: 60_000, message: 'calibrations ready' },
    )
    .toEqual(['NOT_REQUIRED', 'READY', 'READY']);
  await shot(pages.mde.admin, '01-admin-mde-rounds');
  await shot(pages.bog.admin, '01-admin-bog-rounds');

  // ---- Lobby: stages open, players join.
  for (const city of CITIES) {
    await pages[city].stage.goto(`${UI}/stage/${city}`);
    for (const [i, phone] of PHONES[city].entries()) {
      await joinPhone(pages[city].phones[i], city, phone.nickname);
    }
    for (const bot of pages[city].bots) {
      await bot.join(api);
    }
  }
  for (const city of CITIES) {
    await expect(pages[city].stage.locator('body')).toContainText(PHONES[city][0].nickname);
    await shot(pages[city].stage, `02-stage-${city}-lobby`);
    await shot(pages[city].phones[0], `02-phone-${city}-lobby`, 0);
  }
  // City isolation: Bogotá's lobby never lists Medellín's players.
  await expect(pages.bog.stage.locator('body')).not.toContainText(PHONES.mde[0].nickname);

  // ---- Practice round in both cities; Medellín shows the practice gallery.
  for (const city of CITIES) {
    await startNext(pages[city].admin, city, PRACTICE);
  }
  for (const city of CITIES) {
    for (const [i] of PHONES[city].entries()) {
      await playPhone(pages[city].phones[i], city, PRACTICE, `un gato durmiendo al sol ${i}`);
    }
    for (const bot of pages[city].bots) {
      await bot.play(api, `a sleepy cat by ${bot.nickname}`);
    }
  }
  await shot(pages.mde.stage, '03-stage-mde-practice-open');
  await shot(pages.mde.phones[0], '03-phone-mde-practice', 0);
  for (const city of CITIES) {
    await closeRound(pages[city].admin, city);
    await waitPhase(api, city, 'LOBBY');
  }
  await pages.mde.admin.getByRole('button', { name: COPY.mde.admin.control.gallery }).click();
  await expect(pages.mde.stage.locator('img').nth(2)).toBeVisible();
  await shot(pages.mde.stage, '04-stage-mde-practice-gallery', 3_000);
  await pages.mde.admin.getByRole('button', { name: COPY.mde.admin.control.gallery }).click();

  // ---- Scored rounds 1 and 2 in both cities.
  for (const [r, name] of [ROUND_1, ROUND_2].entries()) {
    for (const city of CITIES) {
      await startNext(pages[city].admin, city, name);
    }
    if (r === 0) {
      await pages.mde.admin.getByRole('button', { name: COPY.mde.admin.control.extend }).click();
    }
    for (const city of CITIES) {
      for (const [i, phone] of PHONES[city].entries()) {
        await playPhone(
          pages[city].phones[i],
          city,
          name,
          `${r === 0 ? 'una taza de café al amanecer' : 'una chiva bajo la lluvia'} [sim=${phone.sim[r]}]`,
        );
      }
      for (const [i, bot] of pages[city].bots.entries()) {
        await bot.play(api, `prompt ${bot.nickname} [sim=${BOTS[city][i].sim[r]}]`);
      }
    }
    for (const city of CITIES) {
      await shot(pages[city].stage, `${nn(5 + r * 3)}-stage-${city}-round${r + 1}-open`);
      await shot(
        pages[city].phones[0],
        `${nn(5 + r * 3)}-phone-${city}-round${r + 1}-submitted`,
        0,
      );
      await shot(pages[city].admin, `${nn(5 + r * 3)}-admin-${city}-round${r + 1}-open`, 0);
    }
    for (const city of CITIES) {
      await closeRound(pages[city].admin, city);
    }
    await shot(pages.mde.phones[0], `${nn(6 + r * 3)}-phone-mde-round${r + 1}-closed`, 500);
    for (const city of CITIES) {
      await waitPhase(api, city, 'ROUND_SCORED');
      await shot(pages[city].stage, `${nn(6 + r * 3)}-stage-${city}-round${r + 1}-scored`);
    }

    // Medellín plays the mini-podium after each scored round; Bogotá skips it.
    await pages.mde.admin.getByRole('button', { name: COPY.mde.admin.control.startMini }).click();
    await waitPhase(api, 'mde', 'MINI_PODIUM');
    const size = (await state(api, 'mde')).miniPodium!.size;
    expect(size).toBe(3);
    for (let step = 1; step <= size; step++) {
      await clickNext(pages.mde.admin, 'mde');
      await expect.poll(async () => (await state(api, 'mde')).miniPodium!.step).toBe(step);
      if (r === 0 || step === size) {
        await shot(pages.mde.stage, `${nn(7 + r * 3)}-stage-mde-round${r + 1}-mini-${step}`, 3_000);
      }
    }
  }

  // ---- Final podium in both cities, revealed 4 → 1 (4 eligible players each).
  for (const city of CITIES) {
    await pages[city].admin
      .getByRole('button', { name: COPY[city].admin.control.startPodium })
      .click();
  }
  for (const city of CITIES) {
    await waitPhase(api, city, 'PODIUM_REVEAL', 30_000);
    await shot(pages[city].stage, `11-stage-${city}-podium-intro`);
  }
  for (const city of CITIES) {
    const size = (await state(api, city)).podium!.size;
    expect(size, `${city} podium size`).toBe(4);
    for (let step = 1; step <= size; step++) {
      await clickNext(pages[city].admin, city);
      await expect.poll(async () => (await state(api, city)).podium!.step).toBe(step);
      await shot(pages[city].stage, `12-stage-${city}-podium-${step}`, 3_000);
    }
    await clickNext(pages[city].admin, city);
    await waitPhase(api, city, 'FINISHED');
    await shot(pages[city].stage, `13-stage-${city}-finished`, 3_000);
    await shot(pages[city].phones[0], `13-phone-${city}-final`, 0);
    await shot(pages[city].admin, `13-admin-${city}-finished`, 0);
  }

  // Winners by total (round 1 + round 2): Medellín Pixel_Paisa (74+88), Bogotá Rolo_Uno (83+79)
  // vs Sabana_Fria (57+93): Rolo_Uno 162 > Sabana_Fria 150.
  await expect(pages.mde.phones[1].locator('body')).toContainText('1');
  await expect(pages.mde.stage.locator('body')).toContainText('Pixel_Paisa');
  await expect(pages.bog.stage.locator('body')).toContainText('Rolo_Uno');
  await expect(pages.bog.stage.locator('body')).not.toContainText('Pixel_Paisa');

  // ---- Results CSV from each admin console.
  for (const city of CITIES) {
    const download = pages[city].admin.waitForEvent('download');
    await pages[city].admin.getByRole('button', { name: COPY[city].admin.event.csv }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`results-${city}.csv`);
    await file.saveAs(`${SHOTS}/results-${city}.csv`);
  }

  await api.dispose();
  expect(problems, 'API errors, failed requests or console errors').toEqual([]);
});
