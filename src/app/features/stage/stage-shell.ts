import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorMessage } from '../../core/api/error-messages';
import { CityService } from '../../core/city/city.service';
import { LanguageService } from '../../core/i18n/language.service';
import { Announcer } from '../../core/ui/announcer';
import { AppHeader } from '../../shared/app-header/app-header';
import { Icon } from '../../shared/icon/icon';
import { Spinner } from '../../shared/spinner/spinner';
import { formatScore } from './score-count-up';
import { StageFinished } from './scenes/stage-finished';
import { StageGallery } from './scenes/stage-gallery';
import { StageLobby } from './scenes/stage-lobby';
import { StageReveal, currentEntry } from './scenes/stage-reveal';
import { StageRound } from './scenes/stage-round';
import { StageWait } from './scenes/stage-wait';
import { StageAutoFit } from './stage-auto-fit';
import { sceneKey } from './stage-scene';
import { StageStateService } from './stage-state.service';

/**
 * `/stage/:city`: the projector (SPEC §10.5). One scene fills the screen, chosen from the stage state
 * (see `sceneFor`); it advances only when the city's admin acts. An editor-style status line names
 * the city and the phase, and leaves the corner free for the settings control. No body text is
 * smaller than `--text-xl` (DESIGN.md §6).
 */
@Component({
  selector: 'pb-stage-shell',
  imports: [
    AppHeader,
    Icon,
    Spinner,
    StageFinished,
    StageGallery,
    StageLobby,
    StageReveal,
    StageRound,
    StageAutoFit,
    StageWait,
    TranslocoPipe,
  ],
  providers: [StageStateService],
  templateUrl: './stage-shell.html',
  styleUrl: './stage-shell.css',
})
export class StageShell {
  private readonly cities = inject(CityService);
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly announcer = inject(Announcer);
  protected readonly stage = inject(StageStateService);

  readonly city = input.required<string>();

  protected readonly cityName = computed(
    () => this.stage.state()?.city.name ?? this.cities.find(this.city())?.name ?? this.city(),
  );
  protected readonly error = computed(() => {
    const error = this.stage.error();
    return error ? errorMessage(error) : null;
  });
  protected readonly heading = computed(() => {
    this.language.language();
    this.language.translationsLoaded();
    return this.transloco.translate(`stage.scene.${this.stage.scene()}`, {
      city: this.cityName(),
    });
  });

  constructor() {
    effect(() => {
      const city = this.city();
      untracked(() => this.stage.start(city));
    });

    effect(() => {
      this.title.setTitle(`${this.heading()} | ${this.transloco.translate('app.name')}`);
    });

    // Each reveal step is announced once (the projector is not usually read aloud, but it can be).
    let lastKey: string | null = null;
    effect(() => {
      const state = this.stage.state();
      const key = sceneKey(state);
      if (key === lastKey) {
        return;
      }
      const first = lastKey === null;
      lastKey = key;
      const entry = state?.reveal ? currentEntry(state.reveal) : null;
      if (first || !entry || !state?.reveal) {
        return;
      }
      untracked(() => {
        const locale = this.language.localeTag();
        const score =
          state.reveal!.kind === 'PODIUM' ? (entry.total ?? entry.roundScore) : entry.roundScore;
        this.announcer.announce(
          this.transloco.translate('stage.reveal.announce', {
            rank: entry.rank,
            nickname: entry.nickname,
            score: formatScore(score, locale),
          }),
          // After the score has counted up.
          1700,
        );
      });
    });
  }
}
