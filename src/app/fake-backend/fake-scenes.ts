import { AdminState, RoundDefinition } from '../core/api/api.models';
import { FAKE_ADMIN_TOKENS, FakeApi, FakeResponse } from './fake-api';

/**
 * Dev and screenshot presets for the stage and admin screens (`?scene=<name>&data=demo|worst` on
 * `/stage/<city>` or `/admin/<city>`, or `window.__pbFake.scene()` from Playwright). Each scene plays
 * the fake event through the fake API's own endpoints (join, attempts, admin actions) until the city
 * reaches that state, so screens see exactly what the API would serve. Dev only, never shipped.
 *
 * Worst-case data (break-ui): 50 players with 16-character nicknames (CJK, accents, unbroken
 * strings), 60-character round names, 300-character prompts, 20-word commentary.
 */

export const STAGE_SCENES = [
  'lobby',
  'gallery',
  'round-open',
  'round-last-minute',
  'practice-closing',
  'closing',
  'scored',
  'mini-0',
  'mini-1',
  'mini-3',
  'final-scoring',
  'podium-0',
  'podium-1',
  'podium-4',
  'podium-5',
  'finished',
] as const;
/** The screenshot list above, plus any reveal step (`mini-2`, `podium-3`…). */
export type StageSceneName = (typeof STAGE_SCENES)[number] | `mini-${number}` | `podium-${number}`;
export type SceneData = 'demo' | 'worst';

export function isStageScene(value: unknown): value is StageSceneName {
  return (
    typeof value === 'string' &&
    ((STAGE_SCENES as readonly string[]).includes(value) || /^(mini|podium)-\d$/.test(value))
  );
}

/** Moves the fake server's clock (its responses' `Date` header follows, so countdowns do too). */
export interface FakeClock {
  advance(ms: number): void;
}

const DEMO_NAMES = [
  'Pixel_Paisa',
  'Ana_dev',
  'Juanca',
  'Mafe_23',
  'El Profe',
  'Lucho',
  'Caro-Codes',
  'Sebas',
];

const WORST_NAMES = [
  'WWWWWWWWWWWWWWWW',
  'José María Pérez',
  '김민준김민준김민준김민준김민준김',
  'Supercalifragili',
  'Ñandú_Ultra_9999',
  'x_x-x_x-x_x-x_x-',
];

const DEMO_PROMPTS = [
  'una taza de café humeante al amanecer en un pueblo de Antioquia, acuarela',
  'café negro en taza de barro, montañas verdes y niebla al fondo',
  'a cup of coffee at sunrise, watercolor, warm light',
  'taza blanca con café sobre una mesa de madera junto a la ventana',
  'chiva colorida bajo la lluvia, de noche, con reflejos en la calle',
  'un gato naranja durmiendo en una ventana soleada',
  'pueblo colonial con balcones de colores y una taza enorme de café',
  'café, amanecer, pintura al óleo, pinceladas gruesas',
];

/** A 300-character prompt (the API maximum) of real words plus one unbroken token. */
const WORST_PROMPT = fit(
  'Una taza de café humeante al amanecer en un pueblo de Antioquia, con montañas verdes, niebla, ' +
    'balcones de colores, flores en las ventanas, una chiva a lo lejos, luz dorada, acuarela suelta ' +
    'con pinceladas visibles y papel texturizado #superrealismoextremodetalladoultraHD8kfotografía ' +
    'cinematográfica premiada, estilo de ilustración de libro infantil, sin texto',
  300,
);

const WORST_ROUND_NAMES = [
  fit('Café al amanecer en un pueblo de Antioquia con niebla y montañas', 60),
  fit('Chiva colorida bajo la lluvia nocturna con reflejos de neón azul', 60),
];

const WORST_HIDDEN_PROMPT = fit(
  'a steaming cup of coffee at dawn in a small Antioquia town, colorful balconies, green mountains ' +
    'with morning fog, a chiva bus far away, golden light, loose watercolor with visible brush ' +
    'strokes on textured paper, children’s book illustration style, no text, no people, soft shadows',
  300,
);

function fit(text: string, max: number): string {
  return [...text].slice(0, max).join('');
}

/** Builds `scene` for `city` on `api`. Throws if the fake refuses a step (a bug in the scene). */
export function buildScene(
  api: FakeApi,
  clock: FakeClock,
  city: string,
  scene: StageSceneName,
  data: SceneData,
): void {
  const run = new SceneRunner(api, clock, city, data);
  api.longCommentary = data === 'worst';
  run.joinPlayers();
  if (scene === 'lobby') {
    return;
  }
  if (scene === 'practice-closing') {
    run.playRound(run.practiceRound(), { close: true });
    api.hold = true;
    return;
  }
  run.playRound(run.practiceRound(), { close: true, settle: true });
  if (scene === 'gallery') {
    run.admin('POST', '/api/admin/practice/gallery', { show: true });
    return;
  }
  const [first, second] = run.scoredRounds();
  if (scene === 'round-open' || scene === 'round-last-minute') {
    run.playRound(first, { close: false });
    if (scene === 'round-last-minute') {
      clock.advance((first.durationSec - 45) * 1000);
    }
    return;
  }
  if (scene === 'closing') {
    run.playRound(first, { close: true });
    api.hold = true;
    return;
  }
  run.playRound(first, { close: true, settle: true });
  if (scene === 'scored') {
    return;
  }
  if (scene.startsWith('mini-')) {
    run.admin('POST', '/api/admin/mini-podium/start');
    run.next('mini-podium', Number(scene.slice(5)));
    return;
  }
  run.playRound(second, { close: true, settle: true });
  run.admin('POST', '/api/admin/podium/start');
  if (scene === 'final-scoring') {
    api.hold = true;
    return;
  }
  clock.advance(2000);
  if (scene === 'finished') {
    const size = (run.admin('GET', '/api/admin/state').body as AdminState).podium?.size ?? 0;
    run.next('podium', size + 1);
    return;
  }
  run.next('podium', Number(scene.slice(7)));
}

class SceneRunner {
  private readonly adminToken: string;
  private readonly tokens: string[] = [];
  private worstRounds: RoundDefinition[] | null = null;

  constructor(
    private readonly api: FakeApi,
    private readonly clock: FakeClock,
    private readonly city: string,
    private readonly data: SceneData,
  ) {
    const token = Object.entries(FAKE_ADMIN_TOKENS).find(([, code]) => code === city)?.[0];
    if (!token) {
      throw new Error(`No fake admin token for city "${city}"`);
    }
    this.adminToken = token;
  }

  admin(method: string, path: string, body: unknown = null): FakeResponse {
    return this.call(method, path, body, { 'X-Admin-Token': this.adminToken });
  }

  joinPlayers(): void {
    const names =
      this.data === 'demo'
        ? DEMO_NAMES
        : [
            ...WORST_NAMES,
            ...Array.from({ length: 50 - WORST_NAMES.length }, (_, i) =>
              `Jugador_Numero${String(i + 1).padStart(2, '0')}`.slice(0, 16),
            ),
          ];
    for (const nickname of names) {
      const joined = this.call('POST', `/api/cities/${this.city}/players`, { nickname });
      this.tokens.push((joined.body as { token: string }).token);
    }
  }

  practiceRound(): RoundDefinition {
    return this.rounds().find((round) => !round.scored)!;
  }

  scoredRounds(): RoundDefinition[] {
    if (this.data === 'demo') {
      return this.rounds().filter((round) => round.scored);
    }
    this.worstRounds ??= WORST_ROUND_NAMES.map((name) => {
      const preview = this.admin('POST', '/api/admin/rounds/generate-target', {
        prompt: WORST_HIDDEN_PROMPT,
        seed: 2147483647,
      }).body as { previewId: string };
      return this.admin('POST', '/api/admin/rounds', {
        name,
        hiddenPrompt: WORST_HIDDEN_PROMPT,
        durationSec: 1800,
        attemptsPerPlayer: 10,
        scored: true,
        seed: null,
        previewId: preview.previewId,
      }).body as RoundDefinition;
    });
    return this.worstRounds;
  }

  /** Starts `round`, has every player generate (most pick an entry), and optionally closes it. */
  playRound(round: RoundDefinition, options: { close: boolean; settle?: boolean }): void {
    this.admin('POST', `/api/admin/rounds/${round.id}/start`);
    const attempts = this.tokens.map((token, i) => {
      const prompt =
        this.data === 'worst'
          ? fit(`${i + 1} ${WORST_PROMPT}`, 300)
          : `${DEMO_PROMPTS[i % DEMO_PROMPTS.length]}${round.scored ? '' : ' (práctica)'}`;
      const created = this.player(token, 'POST', '/api/rounds/current/attempts', { prompt });
      return (created.body as { attemptId: string }).attemptId;
    });
    // Queue + generation in the fake take about 3.3 s.
    this.clock.advance(4000);
    attempts.forEach((attemptId, i) => {
      if (i % 3 !== 2) {
        this.player(this.tokens[i], 'POST', '/api/rounds/current/entry', { attemptId });
      }
    });
    if (!options.close) {
      return;
    }
    this.admin('POST', `/api/admin/rounds/${round.id}/close`);
    if (options.settle) {
      this.clock.advance(3000);
      this.admin('GET', '/api/admin/state');
    }
  }

  next(kind: 'mini-podium' | 'podium', times: number): void {
    for (let i = 0; i < times; i++) {
      this.admin('POST', `/api/admin/${kind}/next`);
    }
  }

  private rounds(): RoundDefinition[] {
    return this.admin('GET', '/api/admin/rounds').body as RoundDefinition[];
  }

  private player(token: string, method: string, path: string, body: unknown): FakeResponse {
    return this.call(method, path, body, { Authorization: `Bearer ${token}` });
  }

  private call(
    method: string,
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): FakeResponse {
    const url = new URL(path, 'http://fake.invalid');
    const response = this.api.handle({
      method,
      path: url.pathname,
      query: url.searchParams,
      headers: { get: (name) => headers[name] ?? null },
      body,
    });
    if (response.status >= 400) {
      throw new Error(`Scene step ${method} ${path} failed: ${JSON.stringify(response.body)}`);
    }
    return response;
  }
}
