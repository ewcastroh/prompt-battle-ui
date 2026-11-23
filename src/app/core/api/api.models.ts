/**
 * Typed models for docs/API.md v1.4. Field names and nullability follow the contract exactly:
 * fields that don't apply are present with `null`, never omitted.
 * Instants are ISO-8601 UTC strings; image URLs are paths relative to the API base URL.
 */

export type Iso8601 = string;
export type ImagePath = string;

export type Phase =
  | 'LOBBY'
  | 'ROUND_OPEN'
  | 'ROUND_CLOSING'
  | 'ROUND_SCORED'
  | 'MINI_PODIUM'
  | 'FINAL_SCORING'
  | 'PODIUM_REVEAL'
  | 'FINISHED';

export type RunStatus =
  'NOT_STARTED' | 'OPEN' | 'CLOSING' | 'SCORING' | 'SCORED' | 'SCORING_FAILED' | 'CLOSED';

export type AttemptStatus = 'QUEUED' | 'GENERATING' | 'DONE' | 'BLOCKED' | 'FAILED';
export type CalibrationStatus = 'NOT_REQUIRED' | 'PENDING' | 'READY' | 'FAILED';
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type FailureKind = 'TIMEOUT' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'INVALID_RESPONSE';

/** RFC 9457 body with the contract's `code` and `params` (API.md §2). */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  params?: Record<string, unknown> | null;
}

// ---------- Public and player (§5) ----------

export interface City {
  code: string;
  name: string;
}

export interface JoinRequest {
  nickname: string;
}

export interface JoinResponse {
  playerId: string;
  token: string;
  claimCode: string;
  city: string;
}

export interface MePlayer {
  id: string;
  nickname: string;
  claimCode: string;
  city: string;
  cityName: string;
}

export interface MeRound {
  id: string;
  name: string;
  scored: boolean;
  targetUrl: ImagePath;
  targetThumbUrl: ImagePath;
  startedAt: Iso8601;
  endsAt: Iso8601;
  attemptsPerPlayer: number;
  attemptsLeft: number;
  entryAttemptId: string | null;
}

export interface Attempt {
  id: string;
  status: AttemptStatus;
  prompt: string;
  queuePosition: number | null;
  imageUrl: ImagePath | null;
  thumbUrl: ImagePath | null;
  code: string | null;
  createdAt: Iso8601;
}

export interface FinalResult {
  rank: number | null;
  total: number;
  podium: boolean;
}

export interface Me {
  player: MePlayer;
  phase: Phase;
  round: MeRound | null;
  attempts: Attempt[];
  final: FinalResult | null;
}

export interface CreateAttemptRequest {
  prompt: string;
}

export interface CreateAttemptResponse {
  attemptId: string;
  queuePosition: number;
}

export interface SelectEntryRequest {
  attemptId: string;
}

// ---------- Stage (§6) ----------

export interface StageRound {
  id: string;
  name: string;
  scored: boolean;
  targetUrl: ImagePath;
  startedAt: Iso8601;
  endsAt: Iso8601;
  submissionsCount: number;
  attemptsCount: number;
  status: RunStatus;
}

export interface PracticeGalleryItem {
  nickname: string;
  imageUrl: ImagePath;
  thumbUrl: ImagePath;
}

export interface Commentary {
  es: string;
  en: string;
}

export interface RevealEntry {
  rank: number;
  nickname: string;
  prompt: string;
  imageUrl: ImagePath;
  targetUrl: ImagePath;
  roundName: string;
  roundScore: number;
  total: number | null;
  commentary: Commentary;
}

export interface Reveal {
  kind: 'MINI_PODIUM' | 'PODIUM';
  roundId: string | null;
  size: number;
  step: number;
  entries: RevealEntry[];
}

export interface HiddenPrompt {
  roundId: string;
  roundName: string;
  prompt: string;
}

export interface StageState {
  city: City;
  phase: Phase;
  joinUrl: string;
  qrUrl: string;
  playersCount: number;
  nicknames: string[] | null;
  round: StageRound | null;
  practiceGallery: PracticeGalleryItem[] | null;
  reveal: Reveal | null;
  hiddenPrompts: HiddenPrompt[] | null;
}

// ---------- Admin (§7) ----------

export interface AdminMe {
  city: string;
  cityName: string;
}

export interface AdminRound {
  id: string;
  name: string;
  scored: boolean;
  status: RunStatus;
  startedAt: Iso8601 | null;
  endsAt: Iso8601 | null;
  extensions: number;
  imageProvider: string | null;
  embeddingProvider: string | null;
  submissionsCount: number;
  inFlight: number;
}

export interface PodiumPreviewItem {
  rank: number;
  playerId: string;
  nickname: string;
  entryId: string;
  score: number;
  revealed: boolean;
  commentaryReady: boolean;
}

export interface PodiumState {
  /** The mini-podium's round; `null` for the final podium (API.md 1.4). */
  roundId: string | null;
  size: number;
  step: number | null;
  preview: PodiumPreviewItem[];
}

export interface MiniPodiumState extends PodiumState {
  roundId: string;
}

export interface AdminState {
  city: string;
  phase: Phase;
  playersCount: number;
  scoredRoundsDone: number;
  round: AdminRound | null;
  miniPodium: MiniPodiumState | null;
  podium: PodiumState | null;
  practiceGalleryShown: boolean;
}

export interface CalibrationAnchor {
  prompt: string;
  imageUrl: ImagePath;
  thumbUrl: ImagePath;
  excluded: boolean;
}

export interface Calibration {
  status: CalibrationStatus;
  provider: string | null;
  anchors: CalibrationAnchor[];
}

export interface RoundRun {
  city: string;
  status: RunStatus;
  startedAt: Iso8601 | null;
  endsAt: Iso8601 | null;
  extensions: number;
  imageProvider: string | null;
  embeddingProvider: string | null;
  floor: number | null;
  mixedProviders: boolean;
}

export interface RoundDefinition {
  id: string;
  position: number;
  name: string;
  scored: boolean;
  hiddenPrompt: string;
  durationSec: number;
  attemptsPerPlayer: number;
  seed: number;
  targetUrl: ImagePath;
  targetThumbUrl: ImagePath;
  targetSource: 'GENERATED' | 'UPLOADED';
  locked: boolean;
  calibration: Calibration;
  runs: RoundRun[];
}

export interface GenerateTargetRequest {
  prompt: string;
  seed?: number | null;
}

export interface TargetPreview {
  previewId: string;
  imageUrl: ImagePath;
  thumbUrl: ImagePath;
  seed: number;
  provider: string;
  model: string;
}

export interface RoundInput {
  name: string;
  hiddenPrompt: string;
  durationSec: number;
  attemptsPerPlayer: number;
  scored: boolean;
  seed: number | null;
  previewId?: string;
}

export interface AdminPlayer {
  id: string;
  nickname: string;
  claimCode: string;
  joinedAt: Iso8601;
  kicked: boolean;
  flagged: boolean;
  blockedCount: number;
  attemptsCount: number;
  total: number;
}

export interface AdminEntry {
  entryId: string;
  playerId: string;
  nickname: string;
  prompt: string;
  promptEn: string | null;
  imageUrl: ImagePath;
  thumbUrl: ImagePath;
  provider: string;
  model: string;
  embeddingProvider: string | null;
  cos: number | null;
  floor: number | null;
  score: number | null;
  hidden: boolean;
  auto: boolean;
  selectedAt: Iso8601;
}

export interface ImageProviderStatus {
  id: string;
  model: string;
  configured: boolean;
  /** `null` for a provider without a key (API.md §7). */
  circuit: CircuitState | null;
  inFlight: number;
  maxConcurrency: number;
  p50Ms: number | null;
  p95Ms: number | null;
  successCount: number;
  failureCount: number;
  lastError: { kind: FailureKind; at: Iso8601 } | null;
}

export interface EmbeddingProviderStatus {
  id: string;
  model: string;
  configured: boolean;
  healthy: boolean;
  /** Fields are `null` (and `averaging` false) until the first probe. */
  determinism: { maxDiff: number | null; averaging: boolean; checkedAt: Iso8601 | null } | null;
}

export interface Providers {
  active: string;
  chain: string[];
  loadSplit: string[];
  queueLength: number;
  image: ImageProviderStatus[];
  embedding: EmbeddingProviderStatus[];
  commentary: { model: string; configured: boolean };
}

export interface ProbeResult {
  kind: 'IMAGE' | 'EMBEDDING' | 'COMMENTARY';
  providerId: string;
  model: string;
  ok: boolean;
  /** `null` for a `NOT_CONFIGURED` commentary row. */
  latencyMs: number | null;
  errorKind: string | null;
  determinismMaxDiff: number | null;
}

export interface ProbeResponse {
  startedAt: Iso8601;
  results: ProbeResult[];
}

export type AlertCode =
  | 'PROVIDER_SWITCHED'
  | 'PROVIDER_FORCED'
  | 'CIRCUIT_OPEN'
  | 'CIRCUIT_CLOSED'
  | 'EMBEDDING_FAILOVER'
  | 'DETERMINISM_AVERAGING'
  | 'SCORING_FAILED'
  | 'CALIBRATION_FAILED'
  | 'PLAYER_FLAGGED'
  | 'COMMENTARY_FALLBACK'
  | 'EMBEDDING_QUOTA_LOW';

export interface Alert {
  id: string;
  at: Iso8601;
  code: AlertCode;
  city: string | null;
  params: Record<string, unknown>;
}
