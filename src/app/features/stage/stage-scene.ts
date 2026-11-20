import { StageState } from '../../core/api/api.models';

/** What the projector shows (SPEC §10.5), derived from the stage state only. */
export type StageScene =
  | 'loading'
  | 'lobby'
  | 'gallery'
  | 'round-open'
  | 'closing'
  | 'scored'
  | 'final-scoring'
  | 'reveal'
  | 'finished';

export function sceneFor(state: StageState | null): StageScene {
  if (!state) {
    return 'loading';
  }
  switch (state.phase) {
    case 'LOBBY':
      return state.practiceGallery?.length ? 'gallery' : 'lobby';
    case 'ROUND_OPEN':
      return state.round ? 'round-open' : 'loading';
    case 'ROUND_CLOSING':
      return 'closing';
    case 'ROUND_SCORED':
      return 'scored';
    case 'FINAL_SCORING':
      return 'final-scoring';
    case 'MINI_PODIUM':
    case 'PODIUM_REVEAL':
      return state.reveal ? 'reveal' : 'loading';
    case 'FINISHED':
      return 'finished';
  }
}

/**
 * Identity of what is on screen: a new key means a new picture (scene change or a reveal step), so
 * the change cross-fades. Counters and countdowns changing inside a scene keep the key.
 */
export function sceneKey(state: StageState | null): string {
  const scene = sceneFor(state);
  const reveal = state?.reveal;
  return scene === 'reveal' && reveal ? `${scene}:${reveal.kind}:${reveal.step}` : scene;
}
