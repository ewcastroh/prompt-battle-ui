import {
  AdminEntry,
  AdminPlayer,
  AdminState,
  Alert,
  AlertCode,
  Attempt,
  AttemptStatus,
  City,
  Me,
  Phase,
  PodiumPreviewItem,
  Providers,
  RevealEntry,
  RoundDefinition,
  RoundInput,
  RunStatus,
  StageState,
} from '../core/api/api.models';
import { fakeImage, hashString } from './fake-images';

/**
 * In-memory implementation of docs/API.md for local development (`ng serve -c fake`).
 * It never runs in production builds. Time-based progress (generation, timers, scoring) is evaluated
 * lazily on each request, so there are no background timers.
 *
 * Test hooks in prompts: `[blocked]` → BLOCKED, `[fail]` → FAILED, `[sim=0.83]` → that cosine.
 */

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: { get(name: string): string | null };
  body: unknown;
}

export interface FakeResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

/** Fake admin tokens (≥ 24 chars). Not secrets: they only work against this in-browser fake. */
export const FAKE_ADMIN_TOKENS: Readonly<Record<string, string>> = {
  'fake-admin-token-mde-0123456789': 'mde',
  'fake-admin-token-bog-0123456789': 'bog',
};

const QUEUE_MS = 800;
const GENERATE_MS = 2500;
const CLOSING_MS = 2000;
const FINAL_SCORING_MS = 1500;
const FLOOR = 0.412;
const CLAIM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Same rules as the API (NicknameRules, PromptRules): NFC, letters/marks/digits, code points.
const NICKNAME_RE = /^[\p{L}\p{M}\p{Nd} _-]+$/u;
const BLOCKLIST = ['badword', 'groseria'];
const LONG_COMMENTARY = {
  es: '¡Qué maravilla de composición! La luz, los colores y cada detalle se parecen muchísimo al objetivo original de esta ronda.',
  en: 'What a wonderful composition! The light, the colors and every single detail look remarkably close to this round’s original target.',
};

interface FakePlayer {
  id: string;
  city: string;
  nickname: string;
  token: string;
  claimCode: string;
  joinedAt: string;
  kicked: boolean;
  blocks: Map<string, number>;
}

interface FakeAttempt {
  id: string;
  playerId: string;
  roundId: string;
  prompt: string;
  createdAt: number;
  outcome: 'DONE' | 'BLOCKED' | 'FAILED';
  discarded: boolean;
}

interface FakeEntry {
  attemptId: string;
  selectedAt: string;
  auto: boolean;
  hidden: boolean;
  cos: number | null;
  score: number | null;
}

interface FakeRun {
  status: RunStatus;
  startedAt: string | null;
  endsAt: number | null;
  closedAt: number | null;
  extensions: number;
  entries: Map<string, FakeEntry>;
}

interface Reveal {
  size: number;
  step: number;
  ranking: string[];
}

interface FakeCity {
  city: City;
  phase: Phase;
  currentRoundId: string | null;
  runs: Map<string, FakeRun>;
  mini: (Reveal & { roundId: string }) | null;
  podium: Reveal | null;
  finalScoringAt: number | null;
  practiceGalleryShown: boolean;
}

interface FakeRound extends Omit<RoundDefinition, 'runs' | 'locked'> {
  previewSeed?: number;
}

class FakeHttpError {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly params: Record<string, unknown> = {},
  ) {}
}

const iso = (ms: number) => new Date(ms).toISOString();
const round1 = (n: number) => Math.round(n * 10) / 10;

export class FakeApi {
  private readonly cities = new Map<string, FakeCity>();
  private readonly rounds: FakeRound[] = [];
  private readonly players = new Map<string, FakePlayer>();
  private readonly attempts: FakeAttempt[] = [];
  private readonly alerts: Alert[] = [];
  private readonly previews = new Map<string, { seed: number; imageUrl: string }>();
  private activeProvider = 'fal';
  private seq = 0;
  /** Dev scenes: keep transient phases (closing, final scoring) until released. */
  hold = false;
  /** Dev scenes: commentary of the longest allowed shape (20 words per language, SPEC §4.4). */
  longCommentary = false;

  constructor(private readonly now: () => number = () => Date.now()) {
    for (const city of [
      { code: 'mde', name: 'Medellín' },
      { code: 'bog', name: 'Bogotá' },
    ]) {
      this.cities.set(city.code, {
        city,
        phase: 'LOBBY',
        currentRoundId: null,
        runs: new Map(),
        mini: null,
        podium: null,
        finalScoringAt: null,
        practiceGalleryShown: false,
      });
    }
    this.seedRound('Práctica: gato dormido', 'a cat sleeping on a sunny windowsill', false, 180);
    this.seedRound(
      'Café al amanecer',
      'a steaming cup of coffee at dawn in a small Antioquia town, watercolor',
      true,
      480,
    );
    this.seedRound(
      'Chiva en la lluvia',
      'a colorful chiva bus in the rain, night, reflections',
      true,
      480,
    );
  }

  /** Display name of a configured city (dev tools). */
  cityName(code: string): string | null {
    return this.cities.get(code)?.city.name ?? null;
  }

  handle(req: FakeRequest): FakeResponse {
    try {
      const result = this.route(req);
      if (result.status === 200 && isEtagPath(req.path)) {
        const etag = `W/"${hashString(JSON.stringify(result.body)).toString(16)}"`;
        result.headers['ETag'] = etag;
        result.headers['Cache-Control'] =
          req.path === '/api/me' || req.path.startsWith('/api/admin')
            ? 'private, no-cache'
            : 'no-cache';
        if (req.headers.get('If-None-Match') === etag) {
          return {
            status: 304,
            body: null,
            headers: { ...result.headers, Date: new Date(this.now()).toUTCString() },
          };
        }
      }
      result.headers['Date'] = new Date(this.now()).toUTCString();
      return result;
    } catch (error) {
      if (error instanceof FakeHttpError) {
        return {
          status: error.status,
          body: {
            type: 'about:blank',
            title: 'Fake error',
            status: error.status,
            detail: `fake backend: ${error.code}`,
            instance: req.path,
            code: error.code,
            params: error.params,
          },
          headers: {
            'Content-Type': 'application/problem+json',
            Date: new Date(this.now()).toUTCString(),
          },
        };
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------- routing

  private route(req: FakeRequest): FakeResponse {
    const { method, path } = req;
    const seg = path.split('/').filter(Boolean);
    const ok = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
      status,
      body,
      headers,
    });

    // Public and player
    if (method === 'GET' && path === '/api/cities')
      return ok([...this.cities.values()].map((c) => c.city));
    if (
      method === 'POST' &&
      seg[0] === 'api' &&
      seg[1] === 'cities' &&
      seg[3] === 'players' &&
      seg.length === 4
    ) {
      return this.join(seg[2], req);
    }
    if (method === 'GET' && path === '/api/me') return ok(this.me(this.player(req)));
    if (method === 'POST' && path === '/api/rounds/current/attempts')
      return ok(this.createAttempt(this.player(req), req.body), 202);
    if (method === 'GET' && seg[1] === 'attempts' && seg.length === 3)
      return ok(this.attemptView(this.ownAttempt(this.player(req), seg[2])));
    if (method === 'POST' && path === '/api/rounds/current/entry') {
      this.selectEntry(this.player(req), req.body);
      return ok(null, 204);
    }

    // Stage
    if (method === 'GET' && seg[1] === 'cities' && seg[3] === 'stage' && seg[4] === 'state')
      return ok(this.stage(this.cityRun(seg[2])));
    if (method === 'GET' && seg[1] === 'cities' && seg[3] === 'qr.png') {
      this.cityRun(seg[2]);
      return ok(fakeImage(`qr-${seg[2]}`, `QR /play/${seg[2]}`));
    }

    // Admin
    if (seg[0] === 'api' && seg[1] === 'admin') return this.admin(req, seg.slice(2), ok);

    throw new FakeHttpError(404, 'NOT_FOUND');
  }

  private admin(
    req: FakeRequest,
    seg: string[],
    ok: (body: unknown, status?: number, headers?: Record<string, string>) => FakeResponse,
  ): FakeResponse {
    const cityCode = FAKE_ADMIN_TOKENS[req.headers.get('X-Admin-Token') ?? ''];
    if (!cityCode) throw new FakeHttpError(401, 'UNAUTHORIZED');
    const city = this.cityRun(cityCode);
    const m = req.method;
    const p = seg.join('/');

    if (m === 'GET' && p === 'me') return ok({ city: cityCode, cityName: city.city.name });
    if (m === 'GET' && p === 'state') return ok(this.adminState(city));

    if (m === 'GET' && p === 'rounds') return ok(this.rounds.map((r) => this.roundView(r)));
    if (m === 'POST' && p === 'rounds/generate-target') return ok(this.generateTarget(req.body));
    if (m === 'POST' && p === 'rounds') return ok(this.createRound(req.body), 201);
    if (seg[0] === 'rounds' && seg.length === 2) {
      const round = this.findRound(seg[1]);
      if (m === 'PUT') return ok(this.updateRound(round, req.body));
      if (m === 'DELETE') {
        this.assertUnlocked(round);
        this.rounds.splice(this.rounds.indexOf(round), 1);
        return ok(null, 204);
      }
    }
    if (m === 'POST' && seg[0] === 'rounds' && seg.length === 3) {
      const round = this.findRound(seg[1]);
      switch (seg[2]) {
        case 'calibrate':
          this.assertUnlocked(round);
          if (!round.scored)
            throw new FakeHttpError(409, 'INVALID_TRANSITION', { phase: city.phase });
          return ok(this.roundView(round), 202);
        case 'start':
          this.start(city, round);
          return ok(this.adminState(city));
        case 'close':
          this.close(city, round);
          return ok(this.adminState(city));
        case 'extend':
          this.extend(city, round);
          return ok(this.adminState(city));
        case 'rescore':
          throw new FakeHttpError(409, 'SCORING_FAILED');
      }
    }
    if (m === 'POST' && p === 'mini-podium/start') {
      this.miniStart(city);
      return ok(this.adminState(city));
    }
    if (m === 'POST' && p === 'mini-podium/next') {
      if (city.phase !== 'MINI_PODIUM' || !city.mini || city.mini.step >= city.mini.size)
        this.invalid(city);
      city.mini!.step++;
      return ok(this.adminState(city));
    }
    if (m === 'POST' && p === 'podium/start') {
      this.podiumStart(city);
      return ok(this.adminState(city));
    }
    if (m === 'POST' && p === 'podium/next') {
      if (city.phase !== 'PODIUM_REVEAL' || !city.podium) this.invalid(city);
      if (city.podium!.step >= city.podium!.size) city.phase = 'FINISHED';
      else city.podium!.step++;
      return ok(this.adminState(city));
    }
    if (m === 'POST' && p === 'podium/reset') {
      if ((city.phase !== 'PODIUM_REVEAL' && city.phase !== 'FINISHED') || !city.podium)
        this.invalid(city);
      city.phase = 'PODIUM_REVEAL';
      city.podium!.step = 0;
      return ok(this.adminState(city));
    }
    if (m === 'POST' && p === 'practice/gallery') {
      if (city.phase !== 'LOBBY' || !this.closedPracticeRun(city)) this.invalid(city);
      city.practiceGalleryShown = (req.body as { show?: unknown } | null)?.show === true;
      return ok(this.adminState(city));
    }

    if (m === 'GET' && p === 'players')
      return ok(this.cityPlayers(cityCode).map((pl) => this.adminPlayer(city, pl)));
    if (m === 'POST' && seg[0] === 'players' && seg.length === 3) {
      const player = this.players.get(seg[1]);
      if (!player) throw new FakeHttpError(404, 'PLAYER_NOT_FOUND');
      if (player.city !== cityCode) throw new FakeHttpError(403, 'ADMIN_FORBIDDEN');
      if (seg[2] === 'rename') {
        player.nickname = this.validNickname(
          cityCode,
          (req.body as { nickname?: unknown } | null)?.nickname,
          player.id,
        );
        return ok(this.adminPlayer(city, player));
      }
      if (seg[2] === 'kick') {
        player.kicked = true;
        return ok(null, 204);
      }
    }

    if (m === 'GET' && p === 'entries') {
      const roundId = req.query.get('roundId');
      if (!roundId) throw new FakeHttpError(400, 'VALIDATION_FAILED', { field: 'roundId' });
      return ok(this.adminEntries(city, this.findRound(roundId)));
    }
    if (m === 'POST' && seg[0] === 'entries' && seg[2] === 'hide') {
      const found = this.findEntry(seg[1]);
      if (found.player.city !== cityCode) throw new FakeHttpError(403, 'ADMIN_FORBIDDEN');
      found.entry.hidden = (req.body as { hidden?: unknown } | null)?.hidden !== false;
      return ok(null, 204);
    }
    if (m === 'GET' && p === 'results.csv') {
      return ok(this.csv(city), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="results-${cityCode}.csv"`,
      });
    }

    if (m === 'GET' && p === 'providers') return ok(this.providers());
    if (m === 'POST' && p === 'providers/active') {
      const id = (req.body as { providerId?: unknown } | null)?.providerId;
      if (id !== 'fal' && id !== 'bfl')
        throw new FakeHttpError(404, 'PROVIDER_NOT_FOUND', { providerId: String(id) });
      this.activeProvider = id;
      this.alert('PROVIDER_FORCED', null, { providerId: id, byCity: cityCode });
      return ok(this.providers());
    }
    if (m === 'POST' && p === 'providers/probe') {
      const at = iso(this.now());
      return ok({
        startedAt: at,
        results: [
          {
            kind: 'IMAGE',
            providerId: 'fal',
            model: 'fake',
            ok: true,
            latencyMs: 900,
            errorKind: null,
            determinismMaxDiff: null,
          },
          {
            kind: 'IMAGE',
            providerId: 'bfl',
            model: 'fake',
            ok: true,
            latencyMs: 1400,
            errorKind: null,
            determinismMaxDiff: null,
          },
          {
            kind: 'EMBEDDING',
            providerId: 'gemini',
            model: 'fake',
            ok: true,
            latencyMs: 300,
            errorKind: null,
            determinismMaxDiff: 0,
          },
          {
            kind: 'COMMENTARY',
            providerId: 'anthropic',
            model: 'fake',
            ok: true,
            latencyMs: 700,
            errorKind: null,
            determinismMaxDiff: null,
          },
        ],
      });
    }
    if (m === 'GET' && p === 'alerts') {
      const since = req.query.get('since');
      return ok(this.alerts.filter((a) => !since || a.at > since).slice(0, 100));
    }
    if (m === 'POST' && p === 'event/reset') {
      if ((req.body as { confirm?: unknown } | null)?.confirm !== 'RESET')
        throw new FakeHttpError(400, 'RESET_NOT_CONFIRMED');
      this.reset();
      return ok(null, 204);
    }

    throw new FakeHttpError(404, 'NOT_FOUND');
  }

  // ---------------------------------------------------------------- player

  private join(code: string, req: FakeRequest): FakeResponse {
    const city = this.cityRun(code);
    const existing = this.tokenPlayer(req.headers.get('Authorization'));
    if (existing && existing.city === code && !existing.kicked) {
      return { status: 200, body: this.joinBody(existing), headers: {} };
    }
    const nickname = this.validNickname(
      code,
      (req.body as { nickname?: unknown } | null)?.nickname,
    );
    const player: FakePlayer = {
      id: this.uuid(),
      city: city.city.code,
      nickname,
      token: `pt_fake_${this.uuid().replaceAll('-', '')}`,
      claimCode: this.claimCode(code),
      joinedAt: iso(this.now()),
      kicked: false,
      blocks: new Map(),
    };
    this.players.set(player.id, player);
    return { status: 201, body: this.joinBody(player), headers: {} };
  }

  private joinBody(p: FakePlayer) {
    return { playerId: p.id, token: p.token, claimCode: p.claimCode, city: p.city };
  }

  private me(player: FakePlayer): Me {
    const city = this.cityRun(player.city);
    const round = this.showsRound(city.phase) ? this.currentRound(city) : null;
    const run = round ? city.runs.get(round.id) : undefined;
    const attempts = round ? this.playerAttempts(player.id, round.id) : [];
    const doneCount = attempts.filter((a) => this.status(a) === 'DONE').length;
    const final = this.finalFor(city, player);
    return {
      player: {
        id: player.id,
        nickname: player.nickname,
        claimCode: player.claimCode,
        city: player.city,
        cityName: city.city.name,
      },
      phase: city.phase,
      round:
        round && run
          ? {
              id: round.id,
              name: round.name,
              scored: round.scored,
              targetUrl: round.targetUrl,
              targetThumbUrl: round.targetThumbUrl,
              startedAt: run.startedAt ?? iso(this.now()),
              endsAt: iso(run.endsAt ?? this.now()),
              attemptsPerPlayer: round.attemptsPerPlayer,
              attemptsLeft: Math.max(0, round.attemptsPerPlayer - doneCount),
              entryAttemptId: run.entries.get(player.id)?.attemptId ?? null,
            }
          : null,
      attempts: attempts.map((a) => this.attemptView(a)),
      final,
    };
  }

  private createAttempt(player: FakePlayer, body: unknown) {
    const city = this.cityRun(player.city);
    const round = this.currentRound(city);
    if (city.phase !== 'ROUND_OPEN' || !round) throw new FakeHttpError(409, 'ROUND_NOT_OPEN');
    const prompt = normalize((body as { prompt?: unknown } | null)?.prompt);
    if (codePoints(prompt) < 1 || codePoints(prompt) > 300)
      throw new FakeHttpError(400, 'PROMPT_INVALID', { min: 1, max: 300 });
    const mine = this.playerAttempts(player.id, round.id);
    if (mine.some((a) => ['QUEUED', 'GENERATING'].includes(this.status(a))))
      throw new FakeHttpError(409, 'GENERATION_IN_FLIGHT');
    if (mine.filter((a) => this.status(a) === 'DONE').length >= round.attemptsPerPlayer) {
      throw new FakeHttpError(409, 'NO_ATTEMPTS_LEFT', { max: round.attemptsPerPlayer });
    }
    if (BLOCKLIST.some((word) => fold(prompt).includes(word))) {
      player.blocks.set(round.id, (player.blocks.get(round.id) ?? 0) + 1);
      if (player.blocks.get(round.id) === 3)
        this.alert('PLAYER_FLAGGED', player.city, {
          playerId: player.id,
          nickname: player.nickname,
        });
      throw new FakeHttpError(422, 'PROMPT_BLOCKED');
    }
    const attempt: FakeAttempt = {
      id: this.uuid(),
      playerId: player.id,
      roundId: round.id,
      prompt,
      createdAt: this.now(),
      outcome: prompt.includes('[blocked]')
        ? 'BLOCKED'
        : prompt.includes('[fail]')
          ? 'FAILED'
          : 'DONE',
      discarded: false,
    };
    this.attempts.push(attempt);
    return { attemptId: attempt.id, queuePosition: this.queuePosition(attempt) ?? 1 };
  }

  private selectEntry(player: FakePlayer, body: unknown): void {
    const city = this.cityRun(player.city);
    const round = this.currentRound(city);
    if (city.phase !== 'ROUND_OPEN' || !round) throw new FakeHttpError(409, 'ROUND_NOT_OPEN');
    const attempt = this.ownAttempt(
      player,
      String((body as { attemptId?: unknown } | null)?.attemptId ?? ''),
    );
    if (attempt.roundId !== round.id || this.status(attempt) !== 'DONE')
      throw new FakeHttpError(409, 'ATTEMPT_NOT_SELECTABLE');
    city.runs.get(round.id)!.entries.set(player.id, {
      attemptId: attempt.id,
      selectedAt: iso(this.now()),
      auto: false,
      hidden: false,
      cos: null,
      score: null,
    });
  }

  private attemptView(a: FakeAttempt): Attempt {
    const status = this.status(a);
    const done = status === 'DONE';
    const image = done ? fakeImage(`${a.prompt}|${a.roundId}`, a.prompt) : null;
    return {
      id: a.id,
      status,
      prompt: a.prompt,
      queuePosition: status === 'QUEUED' ? this.queuePosition(a) : null,
      imageUrl: image,
      thumbUrl: image,
      code:
        status === 'BLOCKED'
          ? 'PROMPT_BLOCKED'
          : status === 'FAILED'
            ? a.discarded
              ? 'ROUND_NOT_OPEN'
              : 'GENERATION_FAILED'
            : null,
      createdAt: iso(a.createdAt),
    };
  }

  private status(a: FakeAttempt): AttemptStatus {
    if (a.discarded) return 'FAILED';
    const age = this.now() - a.createdAt;
    if (age < QUEUE_MS) return 'QUEUED';
    if (age < GENERATE_MS) return 'GENERATING';
    return a.outcome;
  }

  private queuePosition(a: FakeAttempt): number | null {
    if (this.status(a) !== 'QUEUED') return null;
    return this.attempts.filter((o) => this.status(o) === 'QUEUED' && o.createdAt <= a.createdAt)
      .length;
  }

  private finalFor(city: FakeCity, player: FakePlayer) {
    const visible =
      city.phase === 'FINISHED' ||
      (city.phase === 'PODIUM_REVEAL' && city.podium && city.podium.step >= city.podium.size);
    if (!visible) return null;
    const ranking = this.finalRanking(city);
    const index = ranking.indexOf(player.id);
    return {
      rank: index >= 0 ? index + 1 : null,
      total: this.total(city, player.id),
      podium: index >= 0 && index < (city.podium?.size ?? 0),
    };
  }

  // ---------------------------------------------------------------- run control

  private start(city: FakeCity, round: FakeRound): void {
    this.tick(city);
    if (!['LOBBY', 'ROUND_SCORED', 'MINI_PODIUM'].includes(city.phase) || city.runs.has(round.id))
      this.invalid(city);
    const now = this.now();
    city.runs.set(round.id, {
      status: 'OPEN',
      startedAt: iso(now),
      endsAt: now + round.durationSec * 1000,
      closedAt: null,
      extensions: 0,
      entries: new Map(),
    });
    city.currentRoundId = round.id;
    city.phase = 'ROUND_OPEN';
    city.mini = null;
    city.practiceGalleryShown = false;
  }

  private close(city: FakeCity, round: FakeRound): void {
    this.tick(city);
    if (city.phase !== 'ROUND_OPEN' || city.currentRoundId !== round.id) this.invalid(city);
    this.closeRun(city, round, this.now());
  }

  private extend(city: FakeCity, round: FakeRound): void {
    this.tick(city);
    const run = city.runs.get(round.id);
    if (
      city.phase !== 'ROUND_OPEN' ||
      city.currentRoundId !== round.id ||
      !run ||
      run.endsAt === null
    )
      this.invalid(city);
    run!.endsAt! += 60_000;
    run!.extensions++;
  }

  private closeRun(city: FakeCity, round: FakeRound, at: number): void {
    const run = city.runs.get(round.id)!;
    run.status = 'CLOSING';
    run.closedAt = at;
    run.endsAt = Math.min(run.endsAt ?? at, at);
    city.phase = 'ROUND_CLOSING';
    for (const player of this.cityPlayers(city.city.code)) {
      if (run.entries.has(player.id)) continue;
      const last = this.playerAttempts(player.id, round.id)
        .filter((a) => this.status(a) === 'DONE')
        .at(-1);
      if (last)
        run.entries.set(player.id, {
          attemptId: last.id,
          selectedAt: iso(at),
          auto: true,
          hidden: false,
          cos: null,
          score: null,
        });
    }
    for (const a of this.attempts) {
      if (a.roundId === round.id && ['QUEUED', 'GENERATING'].includes(this.status(a)))
        a.discarded = true;
    }
  }

  /** Applies time-based transitions for one city (timer close, scoring, final scoring). */
  private tick(city: FakeCity): void {
    const now = this.now();
    const round = this.currentRound(city);
    const run = round ? city.runs.get(round.id) : undefined;
    if (round && run) {
      if (city.phase === 'ROUND_OPEN' && run.endsAt !== null && now >= run.endsAt)
        this.closeRun(city, round, run.endsAt);
      if (
        !this.hold &&
        city.phase === 'ROUND_CLOSING' &&
        run.closedAt !== null &&
        now >= run.closedAt + CLOSING_MS
      ) {
        if (round.scored) {
          for (const entry of run.entries.values()) {
            const attempt = this.attempts.find((a) => a.id === entry.attemptId)!;
            entry.cos = fakeCos(attempt.prompt);
            entry.score = round1(100 * Math.min(1, Math.max(0, (entry.cos - FLOOR) / (1 - FLOOR))));
          }
          run.status = 'SCORED';
          city.phase = 'ROUND_SCORED';
        } else {
          run.status = 'CLOSED';
          city.phase = 'LOBBY';
        }
      }
    }
    if (
      !this.hold &&
      city.phase === 'FINAL_SCORING' &&
      city.finalScoringAt !== null &&
      now >= city.finalScoringAt + FINAL_SCORING_MS
    ) {
      city.phase = 'PODIUM_REVEAL';
    }
  }

  private miniStart(city: FakeCity): void {
    this.tick(city);
    const round = this.currentRound(city);
    if (city.phase !== 'ROUND_SCORED' || !round) this.invalid(city);
    const ranking = this.roundRanking(city, round!.id);
    city.mini = { roundId: round!.id, size: Math.min(3, ranking.length), step: 0, ranking };
    city.phase = 'MINI_PODIUM';
  }

  private podiumStart(city: FakeCity): void {
    this.tick(city);
    const scoredDone = [...city.runs.values()].some((r) => r.status === 'SCORED');
    if (!['LOBBY', 'ROUND_SCORED', 'MINI_PODIUM'].includes(city.phase) || !scoredDone)
      this.invalid(city);
    const ranking = this.finalRanking(city);
    city.podium = { size: Math.min(5, ranking.length), step: 0, ranking };
    city.phase = 'FINAL_SCORING';
    city.finalScoringAt = this.now();
    city.mini = null;
  }

  // ---------------------------------------------------------------- ranking

  private scoredRuns(city: FakeCity): [FakeRound, FakeRun][] {
    return this.rounds
      .filter((r) => r.scored && city.runs.get(r.id)?.status === 'SCORED')
      .map((r) => [r, city.runs.get(r.id)!]);
  }

  private total(city: FakeCity, playerId: string): number {
    return round1(
      this.scoredRuns(city).reduce((sum, [, run]) => {
        const entry = run.entries.get(playerId);
        return sum + (entry && !entry.hidden ? (entry.score ?? 0) : 0);
      }, 0),
    );
  }

  private best(city: FakeCity, playerId: string): { round: FakeRound; entry: FakeEntry } | null {
    let best: { round: FakeRound; entry: FakeEntry } | null = null;
    for (const [round, run] of this.scoredRuns(city)) {
      const entry = run.entries.get(playerId);
      if (entry && !entry.hidden && (!best || (entry.score ?? 0) > (best.entry.score ?? 0)))
        best = { round, entry };
    }
    return best;
  }

  private finalRanking(city: FakeCity): string[] {
    if (city.podium) return city.podium.ranking.filter((id) => this.best(city, id) !== null);
    return this.cityPlayers(city.city.code)
      .filter((p) => !p.kicked && this.best(city, p.id) !== null)
      .sort(
        (a, b) =>
          this.total(city, b.id) - this.total(city, a.id) ||
          (this.best(city, b.id)!.entry.score ?? 0) - (this.best(city, a.id)!.entry.score ?? 0),
      )
      .map((p) => p.id);
  }

  private roundRanking(city: FakeCity, roundId: string): string[] {
    const run = city.runs.get(roundId);
    if (!run) return [];
    return [...run.entries.entries()]
      .filter(([playerId, e]) => !e.hidden && !this.players.get(playerId)!.kicked)
      .sort(
        ([, a], [, b]) =>
          (b.score ?? 0) - (a.score ?? 0) || a.selectedAt.localeCompare(b.selectedAt),
      )
      .map(([playerId]) => playerId);
  }

  // ---------------------------------------------------------------- views

  private stage(city: FakeCity): StageState {
    this.tick(city);
    const round = this.currentRound(city);
    const run = round ? city.runs.get(round.id) : undefined;
    const showRound = ['ROUND_OPEN', 'ROUND_CLOSING', 'ROUND_SCORED'].includes(city.phase);
    return {
      city: city.city,
      phase: city.phase,
      joinUrl: `http://localhost:4200/play/${city.city.code}`,
      // A data URI, not `/api/…/qr.png`: <img> requests bypass the fake interceptor.
      qrUrl: fakeImage(`qr-${city.city.code}`, `QR /play/${city.city.code}`),
      playersCount: this.cityPlayers(city.city.code).filter((p) => !p.kicked).length,
      nicknames:
        city.phase === 'LOBBY'
          ? this.cityPlayers(city.city.code)
              .filter((p) => !p.kicked)
              .map((p) => p.nickname)
          : null,
      round:
        showRound && round && run
          ? {
              id: round.id,
              name: round.name,
              scored: round.scored,
              targetUrl: round.targetUrl,
              startedAt: run.startedAt!,
              endsAt: iso(run.endsAt!),
              submissionsCount: run.entries.size,
              attemptsCount: this.attempts.filter(
                (a) =>
                  a.roundId === round.id && this.players.get(a.playerId)!.city === city.city.code,
              ).length,
              status: run.status,
            }
          : null,
      practiceGallery:
        city.phase === 'LOBBY' && city.practiceGalleryShown ? this.practiceGallery(city) : null,
      reveal: this.reveal(city),
      hiddenPrompts:
        city.phase === 'FINISHED'
          ? this.scoredRuns(city).map(([r]) => ({
              roundId: r.id,
              roundName: r.name,
              prompt: r.hiddenPrompt,
            }))
          : null,
    };
  }

  private reveal(city: FakeCity): StageState['reveal'] {
    if (city.phase === 'MINI_PODIUM' && city.mini) {
      const round = this.findRound(city.mini.roundId);
      const run = city.runs.get(round.id)!;
      const entries: RevealEntry[] = [];
      for (let k = 1; k <= city.mini.step; k++) {
        const rank = city.mini.size - k + 1;
        const playerId = city.mini.ranking[rank - 1];
        const entry = run.entries.get(playerId)!;
        entries.push(this.revealEntry(rank, playerId, round, entry, null));
      }
      return {
        kind: 'MINI_PODIUM',
        roundId: round.id,
        size: city.mini.size,
        step: city.mini.step,
        entries,
      };
    }
    if ((city.phase === 'PODIUM_REVEAL' || city.phase === 'FINISHED') && city.podium) {
      const ranking = this.finalRanking(city);
      const entries: RevealEntry[] = [];
      const steps = city.phase === 'FINISHED' ? city.podium.size : city.podium.step;
      for (let k = 1; k <= steps; k++) {
        const rank = city.podium.size - k + 1;
        const playerId = ranking[rank - 1];
        const best = playerId ? this.best(city, playerId) : null;
        if (best)
          entries.push(
            this.revealEntry(rank, playerId, best.round, best.entry, this.total(city, playerId)),
          );
      }
      return {
        kind: 'PODIUM',
        roundId: null,
        size: city.podium.size,
        step: city.podium.step,
        entries,
      };
    }
    return null;
  }

  private revealEntry(
    rank: number,
    playerId: string,
    round: FakeRound,
    entry: FakeEntry,
    total: number | null,
  ): RevealEntry {
    const attempt = this.attempts.find((a) => a.id === entry.attemptId)!;
    const view = this.attemptView(attempt);
    const score = entry.score ?? 0;
    return {
      rank,
      nickname: this.players.get(playerId)!.nickname,
      prompt: attempt.prompt,
      imageUrl: view.imageUrl ?? '',
      targetUrl: round.targetUrl,
      roundName: round.name,
      roundScore: score,
      total,
      commentary: this.longCommentary
        ? LONG_COMMENTARY
        : score >= 70
          ? { es: '¡Casi idéntica al objetivo!', en: 'Nearly identical to the target!' }
          : { es: '¡Buena idea, con estilo propio!', en: 'Nice idea, with its own style!' },
    };
  }

  private practiceGallery(city: FakeCity) {
    const run = this.closedPracticeRun(city);
    if (!run) return [];
    return [...run.entries.entries()]
      .filter(([, e]) => !e.hidden)
      .slice(0, 6)
      .map(([playerId, e]) => {
        const view = this.attemptView(this.attempts.find((a) => a.id === e.attemptId)!);
        return {
          nickname: this.players.get(playerId)!.nickname,
          imageUrl: view.imageUrl ?? '',
          thumbUrl: view.thumbUrl ?? '',
        };
      });
  }

  private adminState(city: FakeCity): AdminState {
    this.tick(city);
    const round = this.currentRound(city);
    const run = round ? city.runs.get(round.id) : undefined;
    const preview = (
      reveal: Reveal,
      score: (playerId: string) => number,
      entryOf: (playerId: string) => string,
    ): PodiumPreviewItem[] =>
      // Reveal order, rank `size` first (API.md 1.4).
      reveal.ranking
        .slice(0, reveal.size)
        .map((playerId, i) => ({
          rank: i + 1,
          playerId,
          nickname: this.players.get(playerId)!.nickname,
          entryId: entryOf(playerId),
          score: score(playerId),
          revealed: reveal.size - (i + 1) + 1 <= reveal.step,
          commentaryReady: true,
        }))
        .reverse();
    const livePodium: Reveal = city.podium ?? { size: 0, step: 0, ranking: [] };
    if (!city.podium) {
      const ranking = this.finalRanking(city);
      livePodium.ranking = ranking;
      livePodium.size = Math.min(5, ranking.length);
    }
    return {
      city: city.city.code,
      phase: city.phase,
      playersCount: this.cityPlayers(city.city.code).filter((p) => !p.kicked).length,
      scoredRoundsDone: this.scoredRuns(city).length,
      round:
        round && run
          ? {
              id: round.id,
              name: round.name,
              scored: round.scored,
              status: run.status,
              startedAt: run.startedAt,
              endsAt: run.endsAt === null ? null : iso(run.endsAt),
              extensions: run.extensions,
              imageProvider: this.activeProvider,
              embeddingProvider: round.scored ? 'gemini' : null,
              submissionsCount: run.entries.size,
              inFlight: this.attempts.filter(
                (a) => a.roundId === round.id && ['QUEUED', 'GENERATING'].includes(this.status(a)),
              ).length,
            }
          : null,
      miniPodium: city.mini
        ? {
            roundId: city.mini.roundId,
            size: city.mini.size,
            step: city.mini.step,
            preview: preview(
              city.mini,
              (id) => city.runs.get(city.mini!.roundId)!.entries.get(id)?.score ?? 0,
              (id) => city.runs.get(city.mini!.roundId)!.entries.get(id)?.attemptId ?? '',
            ),
          }
        : null,
      // Non-null once the city has a scored run (API.md 1.4), even with no eligible player.
      podium:
        this.scoredRuns(city).length > 0 || city.podium
          ? {
              roundId: null,
              size: livePodium.size,
              step: city.podium ? city.podium.step : null,
              preview: preview(
                livePodium,
                (id) => this.total(city, id),
                (id) => this.best(city, id)?.entry.attemptId ?? '',
              ),
            }
          : null,
      practiceGalleryShown: city.practiceGalleryShown,
    };
  }

  private adminPlayer(city: FakeCity, p: FakePlayer): AdminPlayer {
    const current = city.currentRoundId;
    return {
      id: p.id,
      nickname: p.nickname,
      claimCode: p.claimCode,
      joinedAt: p.joinedAt,
      kicked: p.kicked,
      flagged: [...p.blocks.values()].some((n) => n >= 3),
      blockedCount: current ? (p.blocks.get(current) ?? 0) : 0,
      attemptsCount: this.attempts.filter((a) => a.playerId === p.id).length,
      total: this.total(city, p.id),
    };
  }

  private adminEntries(city: FakeCity, round: FakeRound): AdminEntry[] {
    const run = city.runs.get(round.id);
    if (!run) return [];
    return [...run.entries.entries()]
      .map(([playerId, e]) => {
        const attempt = this.attempts.find((a) => a.id === e.attemptId)!;
        const view = this.attemptView(attempt);
        return {
          entryId: e.attemptId,
          playerId,
          nickname: this.players.get(playerId)!.nickname,
          prompt: attempt.prompt,
          promptEn: null,
          imageUrl: view.imageUrl ?? '',
          thumbUrl: view.thumbUrl ?? '',
          provider: this.activeProvider,
          model: 'fake',
          embeddingProvider: e.cos === null ? null : 'gemini',
          cos: e.cos,
          floor: e.cos === null ? null : FLOOR,
          score: e.score,
          hidden: e.hidden,
          auto: e.auto,
          selectedAt: e.selectedAt,
        };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }

  private csv(city: FakeCity): string {
    const runs = this.scoredRuns(city);
    const header = [
      'city',
      'rank',
      'nickname',
      'claimCode',
      'total',
      ...runs.map(([r]) => r.name),
      'kicked',
    ];
    const ranking = this.finalRanking(city);
    const rows = this.cityPlayers(city.city.code).map((p) => {
      const rank = ranking.indexOf(p.id);
      return [
        city.city.code,
        rank >= 0 ? String(rank + 1) : '',
        p.nickname,
        p.claimCode,
        String(this.total(city, p.id)),
        ...runs.map(([, run]) => String(run.entries.get(p.id)?.score ?? 0)),
        String(p.kicked),
      ];
    });
    return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
  }

  private providers(): Providers {
    const image = (id: string, max: number) => ({
      id,
      model: 'fake',
      configured: true,
      circuit: 'CLOSED' as const,
      inFlight: 0,
      maxConcurrency: max,
      p50Ms: 1200,
      p95Ms: 2400,
      successCount: this.attempts.length,
      failureCount: 0,
      lastError: null,
    });
    return {
      active: this.activeProvider,
      chain: ['fal', 'bfl'],
      loadSplit: ['fal', 'bfl'],
      queueLength: this.attempts.filter((a) => this.status(a) === 'QUEUED').length,
      image: [image('fal', 10), image('bfl', 24)],
      embedding: [
        { id: 'gemini', model: 'fake', configured: true, healthy: true, determinism: null },
      ],
      commentary: { model: 'fake', configured: true },
    };
  }

  // ---------------------------------------------------------------- rounds

  private seedRound(
    name: string,
    hiddenPrompt: string,
    scored: boolean,
    durationSec: number,
  ): void {
    const seed = hashString(name) % 2147483647;
    const target = fakeImage(`target-${name}`, name);
    this.rounds.push({
      id: this.uuid(),
      position: this.rounds.length + 1,
      name,
      scored,
      hiddenPrompt,
      durationSec,
      attemptsPerPlayer: 3,
      seed,
      targetUrl: target,
      targetThumbUrl: target,
      targetSource: 'GENERATED',
      calibration: {
        status: scored ? 'READY' : 'NOT_REQUIRED',
        provider: scored ? 'fal' : null,
        anchors: scored
          ? [
              'a bowl of soup on a table',
              'a red bicycle',
              'a mountain landscape',
              'a city street at night',
              'a cat sleeping',
              'abstract colorful shapes',
            ].map((prompt) => {
              const img = fakeImage(`${prompt}|${seed}`, prompt);
              return { prompt, imageUrl: img, thumbUrl: img, excluded: false };
            })
          : [],
      },
    });
  }

  private roundView(round: FakeRound): RoundDefinition {
    const runs = [...this.cities.values()].map((city) => {
      this.tick(city);
      const run = city.runs.get(round.id);
      return {
        city: city.city.code,
        status: run?.status ?? 'NOT_STARTED',
        startedAt: run?.startedAt ?? null,
        endsAt: run?.endsAt == null ? null : iso(run.endsAt),
        extensions: run?.extensions ?? 0,
        imageProvider: run ? this.activeProvider : null,
        embeddingProvider: run && round.scored ? 'gemini' : null,
        floor: run?.status === 'SCORED' ? FLOOR : null,
        mixedProviders: false,
      };
    });
    const { previewSeed, ...definition } = round;
    void previewSeed;
    return { ...definition, locked: runs.some((r) => r.status !== 'NOT_STARTED'), runs };
  }

  private generateTarget(body: unknown) {
    const { prompt, seed } = (body ?? {}) as { prompt?: unknown; seed?: unknown };
    const text = normalize(prompt);
    if (codePoints(text) < 1 || codePoints(text) > 1000)
      throw new FakeHttpError(400, 'PROMPT_INVALID', { min: 1, max: 1000 });
    const usedSeed = typeof seed === 'number' ? seed : hashString(text) % 2147483647;
    const id = this.uuid();
    const imageUrl = fakeImage(`target-${text}-${usedSeed}`, text);
    this.previews.set(id, { seed: usedSeed, imageUrl });
    return {
      previewId: id,
      imageUrl,
      thumbUrl: imageUrl,
      seed: usedSeed,
      provider: this.activeProvider,
      model: 'fake',
    };
  }

  private parseRoundInput(body: unknown): { input: RoundInput; uploaded: boolean } {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const raw = body.get('round');
      const input = JSON.parse(typeof raw === 'string' ? raw : '{}') as RoundInput;
      if (!body.get('target')) throw new FakeHttpError(400, 'UPLOAD_INVALID', { maxMb: 10 });
      return { input, uploaded: true };
    }
    return { input: (body ?? {}) as RoundInput, uploaded: false };
  }

  private validateRound(input: RoundInput): void {
    const checks: [keyof RoundInput, boolean][] = [
      [
        'name',
        typeof input.name === 'string' && input.name.trim().length >= 1 && input.name.length <= 60,
      ],
      [
        'hiddenPrompt',
        typeof input.hiddenPrompt === 'string' &&
          input.hiddenPrompt.trim().length >= 1 &&
          input.hiddenPrompt.length <= 1000,
      ],
      [
        'durationSec',
        Number.isInteger(input.durationSec) && input.durationSec >= 60 && input.durationSec <= 1800,
      ],
      [
        'attemptsPerPlayer',
        Number.isInteger(input.attemptsPerPlayer) &&
          input.attemptsPerPlayer >= 1 &&
          input.attemptsPerPlayer <= 10,
      ],
      ['scored', typeof input.scored === 'boolean'],
      [
        'seed',
        input.seed === null ||
          input.seed === undefined ||
          (Number.isInteger(input.seed) && input.seed >= 0 && input.seed <= 2147483647),
      ],
    ];
    const failed = checks.find(([, valid]) => !valid);
    if (failed) throw new FakeHttpError(400, 'VALIDATION_FAILED', { field: failed[0] });
  }

  private createRound(body: unknown): RoundDefinition {
    const { input, uploaded } = this.parseRoundInput(body);
    this.validateRound(input);
    let targetUrl: string;
    let seed = input.seed ?? null;
    if (uploaded) {
      targetUrl = fakeImage(`upload-${this.uuid()}`, input.name);
    } else {
      const preview = input.previewId ? this.previews.get(input.previewId) : undefined;
      if (!preview) throw new FakeHttpError(404, 'PREVIEW_NOT_FOUND');
      this.previews.delete(input.previewId!);
      targetUrl = preview.imageUrl;
      seed ??= preview.seed;
    }
    const round: FakeRound = {
      id: this.uuid(),
      position: this.rounds.length + 1,
      name: input.name.trim(),
      scored: input.scored,
      hiddenPrompt: input.hiddenPrompt.trim(),
      durationSec: input.durationSec,
      attemptsPerPlayer: input.attemptsPerPlayer,
      seed: seed ?? Math.floor(Math.random() * 2147483647),
      targetUrl,
      targetThumbUrl: targetUrl,
      targetSource: uploaded ? 'UPLOADED' : 'GENERATED',
      calibration: {
        status: input.scored ? 'READY' : 'NOT_REQUIRED',
        provider: input.scored ? this.activeProvider : null,
        anchors: [],
      },
    };
    this.rounds.push(round);
    return this.roundView(round);
  }

  private updateRound(round: FakeRound, body: unknown): RoundDefinition {
    this.assertUnlocked(round);
    const { input, uploaded } = this.parseRoundInput(body);
    this.validateRound(input);
    if (uploaded) {
      round.targetUrl = round.targetThumbUrl = fakeImage(`upload-${this.uuid()}`, input.name);
      round.targetSource = 'UPLOADED';
    } else if (input.previewId) {
      const preview = this.previews.get(input.previewId);
      if (!preview) throw new FakeHttpError(404, 'PREVIEW_NOT_FOUND');
      round.targetUrl = round.targetThumbUrl = preview.imageUrl;
      round.targetSource = 'GENERATED';
    }
    Object.assign(round, {
      name: input.name.trim(),
      hiddenPrompt: input.hiddenPrompt.trim(),
      durationSec: input.durationSec,
      attemptsPerPlayer: input.attemptsPerPlayer,
      scored: input.scored,
      seed: input.seed ?? round.seed,
    });
    return this.roundView(round);
  }

  private assertUnlocked(round: FakeRound): void {
    if ([...this.cities.values()].some((c) => c.runs.has(round.id)))
      throw new FakeHttpError(409, 'ROUND_LOCKED');
  }

  // ---------------------------------------------------------------- helpers

  private cityRun(code: string | undefined): FakeCity {
    const city = code ? this.cities.get(code) : undefined;
    if (!city) throw new FakeHttpError(404, 'CITY_NOT_FOUND', { city: code ?? '' });
    this.tick(city);
    return city;
  }

  private tokenPlayer(auth: string | null): FakePlayer | undefined {
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    return token ? [...this.players.values()].find((p) => p.token === token) : undefined;
  }

  private player(req: FakeRequest): FakePlayer {
    const player = this.tokenPlayer(req.headers.get('Authorization'));
    if (!player) throw new FakeHttpError(401, 'UNAUTHORIZED');
    if (player.kicked) throw new FakeHttpError(403, 'PLAYER_KICKED');
    this.cityRun(player.city);
    return player;
  }

  private ownAttempt(player: FakePlayer, id: string): FakeAttempt {
    const attempt = this.attempts.find((a) => a.id === id && a.playerId === player.id);
    if (!attempt) throw new FakeHttpError(404, 'ATTEMPT_NOT_FOUND');
    return attempt;
  }

  private findRound(id: string | undefined): FakeRound {
    const round = this.rounds.find((r) => r.id === id);
    if (!round) throw new FakeHttpError(404, 'ROUND_NOT_FOUND');
    return round;
  }

  private findEntry(entryId: string | undefined): { player: FakePlayer; entry: FakeEntry } {
    for (const city of this.cities.values()) {
      for (const run of city.runs.values()) {
        for (const [playerId, entry] of run.entries) {
          if (entry.attemptId === entryId) return { player: this.players.get(playerId)!, entry };
        }
      }
    }
    throw new FakeHttpError(404, 'ENTRY_NOT_FOUND');
  }

  private currentRound(city: FakeCity): FakeRound | undefined {
    return this.rounds.find((r) => r.id === city.currentRoundId);
  }

  private closedPracticeRun(city: FakeCity): FakeRun | undefined {
    return this.rounds
      .filter((r) => !r.scored)
      .map((r) => city.runs.get(r.id))
      .find((run) => run?.status === 'CLOSED');
  }

  private showsRound(phase: Phase): boolean {
    return ['ROUND_OPEN', 'ROUND_CLOSING', 'ROUND_SCORED', 'MINI_PODIUM'].includes(phase);
  }

  private cityPlayers(code: string): FakePlayer[] {
    return [...this.players.values()].filter((p) => p.city === code);
  }

  private playerAttempts(playerId: string, roundId: string): FakeAttempt[] {
    return this.attempts.filter((a) => a.playerId === playerId && a.roundId === roundId);
  }

  private validNickname(city: string, raw: unknown, exceptId?: string): string {
    const nickname = typeof raw === 'string' ? raw.trim().normalize('NFC') : '';
    const length = codePoints(nickname);
    if (length < 3 || length > 16 || !NICKNAME_RE.test(nickname))
      throw new FakeHttpError(400, 'NICKNAME_INVALID', { min: 3, max: 16 });
    if (BLOCKLIST.some((word) => fold(nickname).includes(word)))
      throw new FakeHttpError(422, 'NICKNAME_BLOCKED');
    if (
      this.cityPlayers(city).some((p) => p.id !== exceptId && fold(p.nickname) === fold(nickname))
    ) {
      throw new FakeHttpError(409, 'NICKNAME_TAKEN');
    }
    return nickname;
  }

  private claimCode(city: string): string {
    const used = new Set(this.cityPlayers(city).map((p) => p.claimCode));
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++)
        code += CLAIM_ALPHABET[Math.floor(Math.random() * CLAIM_ALPHABET.length)];
      if (!used.has(code)) return code;
    }
  }

  private alert(code: AlertCode, city: string | null, params: Record<string, unknown>): void {
    this.alerts.unshift({ id: this.uuid(), at: iso(this.now()), code, city, params });
  }

  private invalid(city: FakeCity): never {
    throw new FakeHttpError(409, 'INVALID_TRANSITION', { phase: city.phase });
  }

  private reset(): void {
    this.players.clear();
    this.attempts.length = 0;
    this.rounds.length = 0;
    this.alerts.length = 0;
    this.previews.clear();
    for (const city of this.cities.values()) {
      Object.assign(city, {
        phase: 'LOBBY',
        currentRoundId: null,
        runs: new Map(),
        mini: null,
        podium: null,
        finalScoringAt: null,
        practiceGalleryShown: false,
      });
    }
  }

  private uuid(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    const n = (++this.seq).toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${n}`;
  }
}

function isEtagPath(path: string): boolean {
  return (
    path === '/api/me' ||
    path === '/api/admin/state' ||
    /^\/api\/cities\/[^/]+\/stage\/state$/.test(path)
  );
}

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function codePoints(value: string): number {
  return [...value].length;
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function fakeCos(prompt: string): number {
  const match = /\[sim=(0(?:\.\d+)?|1(?:\.0+)?)\]/.exec(prompt);
  if (match) return Number(match[1]);
  return 0.3 + (hashString(prompt) % 600) / 1000;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
