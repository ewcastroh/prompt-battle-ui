import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApiError } from '../../../core/api/api-error';
import { PodiumState } from '../../../core/api/api.models';
import { ErrorMessage, errorMessage } from '../../../core/api/error-messages';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatCountdown } from '../../../core/time/server-clock';
import { secondsLeft } from '../../../core/time/seconds-left';
import { Announcer } from '../../../core/ui/announcer';
import { Icon } from '../../../shared/icon/icon';
import { InlineMessage } from '../../../shared/inline-message/inline-message';
import { Spinner } from '../../../shared/spinner/spinner';
import { AdminApi } from '../admin-api';
import { NumberPipe } from '../admin-format';
import { AdminRoundsService } from '../admin-rounds.service';
import { AdminStateService, RunAction } from '../admin-state.service';
import { ConfirmDialog } from '../confirm-dialog';

/** What the big "Next" button does now, for a reveal (API.md §4 steps). */
export interface NextStep {
  readonly kind: 'mini-podium/next' | 'podium/next';
  /** Translation key of the label and its params. */
  readonly labelKey: string;
  readonly rank: number | null;
  /** False when there is nothing left to reveal (mini-podium at its size). */
  readonly enabled: boolean;
}

/** The next reveal step: step k reveals rank size − k + 1; after #1 the podium moves to FINISHED. */
export function nextStep(phase: string, reveal: PodiumState | null): NextStep | null {
  if (!reveal || reveal.step === null) {
    return null;
  }
  const remaining = reveal.size - reveal.step;
  if (phase === 'MINI_PODIUM') {
    return {
      kind: 'mini-podium/next',
      labelKey: remaining > 0 ? 'admin.control.revealRank' : 'admin.control.miniDone',
      rank: remaining > 0 ? remaining : null,
      enabled: remaining > 0,
    };
  }
  if (phase === 'PODIUM_REVEAL') {
    return {
      kind: 'podium/next',
      labelKey: remaining > 0 ? 'admin.control.revealRank' : 'admin.control.showPrompts',
      rank: remaining > 0 ? remaining : null,
      enabled: true,
    };
  }
  return null;
}

/**
 * Live controls for the admin's own city (SPEC §10.6): the phase and current round (countdown,
 * submissions, providers), start the next round, close (confirmed), +60 s, rescore, the mini-podium
 * and final podium with a large "Next", podium reset, the practice gallery switch, and the podium
 * previews where entries can be hidden before they are revealed.
 *
 * Every action goes through `AdminStateService.act`, which runs one action at a time.
 */
@Component({
  selector: 'pb-admin-control',
  imports: [ConfirmDialog, Icon, InlineMessage, NumberPipe, Spinner, TranslocoPipe],
  templateUrl: './admin-control.html',
  styleUrl: './admin-control.css',
})
export class AdminControl {
  private readonly api = inject(AdminApi);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly announcer = inject(Announcer);
  protected readonly live = inject(AdminStateService);
  protected readonly rounds = inject(AdminRoundsService);
  private readonly closeDialog = viewChild.required<ConfirmDialog>('closeDialog');
  private readonly resetDialog = viewChild.required<ConfirmDialog>('resetDialog');

  protected readonly error = signal<ErrorMessage | null>(null);
  protected readonly hiding = signal<string | null>(null);

  protected readonly state = this.live.state;
  protected readonly locale = computed(() => {
    this.language.language();
    return this.language.localeTag();
  });
  protected readonly round = computed(() => this.state()?.round ?? null);
  protected readonly seconds = secondsLeft(
    () => (this.round()?.status === 'OPEN' ? (this.round()?.endsAt ?? null) : null),
    () => this.live.serverOffset(),
  );
  protected readonly countdown = computed(() => formatCountdown(this.seconds()));
  protected readonly next = computed(() => {
    const state = this.state();
    if (!state) {
      return null;
    }
    return nextStep(state.phase, state.phase === 'MINI_PODIUM' ? state.miniPodium : state.podium);
  });
  protected readonly canStartMini = computed(() => this.state()?.phase === 'ROUND_SCORED');
  protected readonly canStartPodium = computed(() => {
    const state = this.state();
    return (
      !!state &&
      state.scoredRoundsDone > 0 &&
      ['LOBBY', 'ROUND_SCORED', 'MINI_PODIUM'].includes(state.phase)
    );
  });
  protected readonly canResetPodium = computed(() =>
    ['PODIUM_REVEAL', 'FINISHED'].includes(this.state()?.phase ?? ''),
  );
  protected readonly showGallerySwitch = computed(
    () => this.state()?.phase === 'LOBBY' && this.rounds.practiceClosed(),
  );
  /** Preview shown under the controls: the running reveal, else the live final-podium preview. */
  protected readonly preview = computed(() => {
    const state = this.state();
    if (!state) {
      return null;
    }
    if (state.phase === 'MINI_PODIUM' && state.miniPodium) {
      return { kind: 'mini' as const, podium: state.miniPodium };
    }
    return state.podium ? { kind: 'podium' as const, podium: state.podium } : null;
  });

  protected readonly closeAction = () => this.runRoundAction('close');
  protected readonly resetAction = () => this.live.act({ kind: 'podium/reset' });

  protected async act(action: RunAction): Promise<void> {
    this.error.set(null);
    const error = await this.live.act(action);
    this.show(error);
  }

  protected startNext(): void {
    const round = this.rounds.nextStartable();
    if (round) {
      void this.act({ kind: 'start', roundId: round.id });
    }
  }

  protected confirmClose(): void {
    this.closeDialog().open();
  }

  protected confirmReset(): void {
    this.resetDialog().open();
  }

  protected async hide(entryId: string, hidden: boolean): Promise<void> {
    if (this.hiding()) {
      return;
    }
    this.hiding.set(entryId);
    this.error.set(null);
    try {
      await this.api.hideEntry(entryId, hidden);
      this.live.refresh();
    } catch (error) {
      this.show(error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN'));
    } finally {
      this.hiding.set(null);
    }
  }

  private runRoundAction(kind: 'close' | 'extend' | 'rescore'): Promise<ApiError | null> {
    const round = this.round();
    return round ? this.live.act({ kind, roundId: round.id }) : Promise.resolve(null);
  }

  protected extend(): void {
    void this.runRoundAction('extend').then((error) => this.show(error));
  }

  protected rescore(): void {
    void this.runRoundAction('rescore').then((error) => this.show(error));
  }

  private show(error: ApiError | null): void {
    if (!error) {
      return;
    }
    const message = errorMessage(error);
    this.error.set(message);
    this.announcer.announce(this.transloco.translate(message.key, message.params));
  }
}
