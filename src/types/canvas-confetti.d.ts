/**
 * Minimal types for canvas-confetti 1.9.4 (ISC), covering only what the stage uses.
 * The package ships no types; a local declaration avoids adding `@types/canvas-confetti`.
 */
declare module 'canvas-confetti' {
  export interface Options {
    particleCount?: number;
    angle?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    gravity?: number;
    drift?: number;
    ticks?: number;
    origin?: { x?: number; y?: number };
    colors?: string[];
    scalar?: number;
    zIndex?: number;
    disableForReducedMotion?: boolean;
  }

  export interface GlobalOptions {
    resize?: boolean;
    useWorker?: boolean;
    disableForReducedMotion?: boolean;
  }

  export interface CreateTypes {
    (options?: Options): Promise<null> | null;
    reset(): void;
  }

  export function create(canvas: HTMLCanvasElement, options?: GlobalOptions): CreateTypes;

  const confetti: CreateTypes & { create: typeof create };
  export default confetti;
}
