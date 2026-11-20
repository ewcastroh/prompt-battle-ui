import { DestroyRef, Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { RoundDefinition, RoundRun } from '../../core/api/api.models';
import { Poller } from '../../core/api/poller';
import { AdminApi } from './admin-api';
import { AdminSessionService } from './admin-session.service';
import { AdminStateService } from './admin-state.service';

/** Shared round definitions change rarely: every 5 s, and at once after any state change. */
const ROUNDS_POLL_MS = 5000;

/** The own city's run of `round`. */
export function ownRun(round: RoundDefinition, city: string): RoundRun | null {
  return round.runs.find((run) => run.city === city) ?? null;
}

/** True when `round` can start in `city` now (API.md §4): phase, not run yet, calibration ready. */
export function canStart(round: RoundDefinition, city: string, phase: string | undefined): boolean {
  const run = ownRun(round, city);
  return (
    !!phase &&
    ['LOBBY', 'ROUND_SCORED', 'MINI_PODIUM'].includes(phase) &&
    (run?.status ?? 'NOT_STARTED') === 'NOT_STARTED' &&
    (round.calibration.status === 'READY' || round.calibration.status === 'NOT_REQUIRED')
  );
}

/**
 * The shared round definitions (`GET /api/admin/rounds`) for the console: the rounds panel and the
 * live controls ("start the next round", the practice gallery switch) read the same list.
 */
@Service({ autoProvided: false })
export class AdminRoundsService {
  private readonly api = inject(AdminApi);
  private readonly session = inject(AdminSessionService);
  private readonly state = inject(AdminStateService);
  private readonly roundsSignal = signal<RoundDefinition[] | null>(null);
  private readonly poller = new Poller({
    intervalMs: ROUNDS_POLL_MS,
    run: async () => {
      if (!this.session.ready()) {
        return false;
      }
      this.roundsSignal.set(await this.api.rounds());
      return true;
    },
  });

  readonly rounds = this.roundsSignal.asReadonly();
  readonly city = computed(() => {
    const session = this.session.session();
    return session.kind === 'ready' ? session.city : '';
  });
  /** The first round this city hasn't run yet that can start now. */
  readonly nextStartable = computed(
    () =>
      this.roundsSignal()?.find((round) =>
        canStart(round, this.city(), this.state.state()?.phase),
      ) ?? null,
  );
  /** This city closed its practice round (the stage gallery can be shown). */
  readonly practiceClosed = computed(
    () =>
      this.roundsSignal()?.some(
        (round) => !round.scored && ownRun(round, this.city())?.status === 'CLOSED',
      ) ?? false,
  );

  constructor() {
    effect(() => {
      const ready = this.session.ready();
      untracked(() => (ready ? this.poller.start() : this.stop()));
    });
    effect(() => {
      this.state.version();
      untracked(() => this.poller.now());
    });
    inject(DestroyRef).onDestroy(() => this.poller.stop());
  }

  reload(): void {
    this.poller.now();
  }

  private stop(): void {
    this.poller.stop();
    this.roundsSignal.set(null);
  }
}
