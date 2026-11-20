import { Attempt, AttemptStatus, FinalResult, Me, MeRound, Phase } from '../core/api/api.models';
import { fakeImage } from './fake-images';

/**
 * Fixed `GET /api/me` states for every player screen, in a "demo" and a "worst case" flavor
 * (break-ui): dev and screenshot tool only, served by the fake backend with `?fixture=<screen>`.
 *
 * Worst-case values are the longest the API accepts (16-character nickname, 60-character round name,
 * 300-character prompts, 10 attempts per round) or realistic shapes (emoji, CJK, unbroken hashtags,
 * a three-digit queue position, an image that fails to load), never random filler.
 */

export const FIXTURE_SCREENS = [
  'join',
  'join-kicked',
  'lobby',
  'round-open',
  'round-busy',
  'round-last-minute',
  'round-no-attempts',
  'round-closed',
  'practice-closed',
  'scored',
  'mini-podium',
  'final-scoring',
  'podium',
  'final',
  'final-podium',
  'final-norank',
] as const;
export type FixtureScreen = (typeof FIXTURE_SCREENS)[number];

export const FIXTURE_DATA = ['demo', 'worst'] as const;
export type FixtureData = (typeof FIXTURE_DATA)[number];

/** Token the fixture player uses (any bearer token is accepted in fixture mode). */
export const FIXTURE_TOKEN = 'pt_fixture_player';

export function isFixtureScreen(value: unknown): value is FixtureScreen {
  return typeof value === 'string' && (FIXTURE_SCREENS as readonly string[]).includes(value);
}

export function isFixtureData(value: unknown): value is FixtureData {
  return typeof value === 'string' && (FIXTURE_DATA as readonly string[]).includes(value);
}

export type FixtureMe =
  | { readonly kind: 'me'; readonly me: Me }
  | { readonly kind: 'error'; readonly status: number; readonly code: string };

/** Cuts `text` to at most `max` UTF-16 units (the editor's `maxlength`) without splitting a character. */
export function fitTo(text: string, max: number): string {
  let out = '';
  for (const char of text) {
    if (out.length + char.length > max) {
      break;
    }
    out += char;
  }
  return out;
}

interface Dataset {
  nickname: string;
  claimCode: string;
  roundName: string;
  practiceName: string;
  attemptsPerPlayer: number;
  /** Attempts of the open round, oldest first; `selected` marks the entry. */
  attempts: readonly (Omit<Attempt, 'id' | 'createdAt' | 'imageUrl' | 'thumbUrl'> & {
    selected?: boolean;
    brokenImage?: boolean;
  })[];
  inFlight: { prompt: string; status: AttemptStatus; queuePosition: number | null };
  finalRank: FinalResult;
  podiumRank: FinalResult;
}

const LONG_PROMPT = fitTo(
  'una chiva colorida 🚌🌧️ bajo un aguacero en Medellín de noche, con luces de neón reflejadas ' +
    'en el pavimento mojado, pasajeros con paraguas de colores, montañas al fondo y un perro ' +
    'callejero mirando la cámara, estilo acuarela muy detallado #MedellínDeNocheBajoLaLluvia' +
    'ConLucesDeNeónReflejadasEnElPavimentoMojado y mucho, muchísimo color en cada ventana 🌈✨',
  300,
);
const CJK_PROMPT =
  '水彩画風のコーヒーカップ、朝焼けの小さな村、湯気が立ちのぼる ☕️🌄 café de Antioquia';
const UNBROKEN_PROMPT =
  'https://example.com/imagenes/referencia-de-una-chiva-colorida-bajo-la-lluvia-en-la-noche-de-feria.jpg ' +
  'pero en estilo pixel art';

const DATASETS: Readonly<Record<FixtureData, Dataset>> = {
  demo: {
    nickname: 'Ana_dev',
    claimCode: 'K7QX',
    roundName: 'Café al amanecer',
    practiceName: 'Práctica: gato dormido',
    attemptsPerPlayer: 3,
    attempts: [
      {
        status: 'DONE',
        prompt: 'una taza de café humeante al amanecer en un pueblo de Antioquia, acuarela',
        queuePosition: null,
        code: null,
        selected: true,
      },
      {
        status: 'DONE',
        prompt: 'café en Jardín al amanecer, montañas con niebla, luz cálida',
        queuePosition: null,
        code: null,
      },
    ],
    inFlight: {
      prompt: 'taza de café con arte latte en forma de montaña',
      status: 'QUEUED',
      queuePosition: 4,
    },
    finalRank: { rank: 7, total: 143.2, podium: false },
    podiumRank: { rank: 2, total: 171.3, podium: true },
  },
  worst: {
    nickname: 'Valentina_Ospina',
    claimCode: 'WMWM',
    roundName: 'La chiva más colorida de la feria bajo un aguacero nocturno',
    practiceName: 'Práctica: un gato dormido en una ventana soleada de Envigado',
    attemptsPerPlayer: 10,
    attempts: [
      { status: 'DONE', prompt: LONG_PROMPT, queuePosition: null, code: null },
      { status: 'DONE', prompt: CJK_PROMPT, queuePosition: null, code: null, selected: true },
      {
        status: 'BLOCKED',
        prompt: 'una pelea de pandillas con armas en el centro de la ciudad de noche',
        queuePosition: null,
        code: 'PROMPT_BLOCKED',
      },
      { status: 'FAILED', prompt: UNBROKEN_PROMPT, queuePosition: null, code: 'GENERATION_FAILED' },
      { status: 'DONE', prompt: 'gato', queuePosition: null, code: null },
      {
        status: 'DONE',
        prompt: 'chiva',
        queuePosition: null,
        code: null,
        brokenImage: true,
      },
      {
        status: 'FAILED',
        prompt: LONG_PROMPT.slice(0, 180),
        queuePosition: null,
        code: 'ROUND_NOT_OPEN',
      },
    ],
    inFlight: { prompt: LONG_PROMPT.slice(0, 240), status: 'QUEUED', queuePosition: 128 },
    finalRank: { rank: 57, total: 0.4, podium: false },
    podiumRank: { rank: 5, total: 199.9, podium: true },
  },
};

const ROUND_ID = '7b0e0000-0000-4000-8000-00000000f1x7';
const PRACTICE_ID = '7b0e0000-0000-4000-8000-00000000p4c7';

/** The fixture for `screen`; `epoch` is fixed per page load so ETags stay stable between polls. */
export function fixtureMe(
  screen: FixtureScreen,
  data: FixtureData,
  city: { code: string; name: string },
  epoch: number,
): FixtureMe {
  const set = DATASETS[data];
  const iso = (offsetMs: number) => new Date(epoch + offsetMs).toISOString();
  const player = {
    id: '0b6e0000-0000-4000-8000-00000000a11a',
    nickname: set.nickname,
    claimCode: set.claimCode,
    city: city.code,
    cityName: city.name,
  };

  const attemptList = (extra: 'none' | 'inFlight' | 'graceRunning'): Attempt[] => {
    const list = set.attempts.map((attempt, index) => {
      const image = fakeImage(`${attempt.prompt}|${index}`, attempt.prompt);
      const done = attempt.status === 'DONE';
      const broken = done && attempt.brokenImage;
      return {
        id: `fx-attempt-${index + 1}`,
        status: attempt.status,
        prompt: attempt.prompt,
        queuePosition: attempt.queuePosition,
        // A path the API base can't serve: the card must survive an image that fails to load.
        imageUrl: done ? (broken ? '/img/fixture-missing.jpg' : image) : null,
        thumbUrl: done ? (broken ? '/img/fixture-missing_thumb.jpg' : image) : null,
        code: attempt.code,
        createdAt: iso(-300_000 + index * 20_000),
      } satisfies Attempt;
    });
    if (extra !== 'none') {
      list.push({
        id: 'fx-attempt-live',
        status: extra === 'graceRunning' ? 'GENERATING' : set.inFlight.status,
        prompt: set.inFlight.prompt,
        queuePosition: extra === 'graceRunning' ? null : set.inFlight.queuePosition,
        imageUrl: null,
        thumbUrl: null,
        code: null,
        createdAt: iso(-5_000),
      });
    }
    return list;
  };

  const entryId = () => {
    const index = set.attempts.findIndex((attempt) => attempt.selected);
    return index >= 0 ? `fx-attempt-${index + 1}` : null;
  };

  const round = (options: {
    scored?: boolean;
    endsInMs?: number;
    attempts: Attempt[];
    exhausted?: boolean;
  }): MeRound => {
    const scored = options.scored ?? true;
    const done = options.attempts.filter((attempt) => attempt.status === 'DONE').length;
    const target = fakeImage(`target-${scored ? set.roundName : set.practiceName}`, 'target');
    return {
      id: scored ? ROUND_ID : PRACTICE_ID,
      name: scored ? set.roundName : set.practiceName,
      scored,
      targetUrl: target,
      targetThumbUrl: target,
      startedAt: iso(-180_000),
      endsAt: iso(options.endsInMs ?? 252_000),
      attemptsPerPlayer: options.exhausted ? done : set.attemptsPerPlayer,
      attemptsLeft: options.exhausted ? 0 : Math.max(0, set.attemptsPerPlayer - done),
      entryAttemptId: entryId(),
    };
  };

  const me = (
    phase: Phase,
    current: MeRound | null,
    attempts: Attempt[],
    final: FinalResult | null = null,
  ): FixtureMe => ({ kind: 'me', me: { player, phase, round: current, attempts, final } });

  switch (screen) {
    case 'join':
    case 'lobby':
      return me('LOBBY', null, []);
    case 'join-kicked':
      return { kind: 'error', status: 403, code: 'PLAYER_KICKED' };
    case 'round-open': {
      const attempts = attemptList('none');
      return me('ROUND_OPEN', round({ attempts }), attempts);
    }
    case 'round-busy': {
      const attempts = attemptList('inFlight');
      return me('ROUND_OPEN', round({ attempts }), attempts);
    }
    case 'round-last-minute': {
      const attempts = attemptList('none');
      return me('ROUND_OPEN', round({ attempts, endsInMs: 45_000 }), attempts);
    }
    case 'round-no-attempts': {
      const attempts = attemptList('none');
      return me('ROUND_OPEN', round({ attempts, exhausted: true }), attempts);
    }
    case 'round-closed': {
      const attempts = attemptList('graceRunning');
      return me('ROUND_CLOSING', round({ attempts, endsInMs: -2_000 }), attempts);
    }
    case 'practice-closed': {
      const attempts = attemptList('none');
      return me('ROUND_CLOSING', round({ scored: false, attempts, endsInMs: -2_000 }), attempts);
    }
    case 'scored': {
      const attempts = attemptList('none');
      return me('ROUND_SCORED', round({ attempts, endsInMs: -60_000 }), attempts);
    }
    case 'mini-podium': {
      const attempts = attemptList('none');
      return me('MINI_PODIUM', round({ attempts, endsInMs: -90_000 }), attempts);
    }
    case 'final-scoring':
      return me('FINAL_SCORING', null, []);
    case 'podium':
      return me('PODIUM_REVEAL', null, []);
    case 'final':
      return me('FINISHED', null, [], set.finalRank);
    case 'final-podium':
      return me('PODIUM_REVEAL', null, [], set.podiumRank);
    case 'final-norank':
      return me('FINISHED', null, [], { rank: null, total: 0, podium: false });
  }
}
