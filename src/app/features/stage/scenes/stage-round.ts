import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiUrlPipe } from '../../../core/api/api-url.pipe';
import { StageRound as Round } from '../../../core/api/api.models';
import { formatCountdown } from '../../../core/time/server-clock';
import { secondsLeft } from '../../../core/time/seconds-left';
import { Icon } from '../../../shared/icon/icon';

/** DESIGN.md §7 "Countdown": the last 60 s use the warning color plus a text cue. */
const LAST_MINUTE_SECONDS = 60;

/**
 * Round open (SPEC §10.5): the target large, a huge countdown on the server clock and the
 * submissions counter. Never any player image (SPEC §6.2): the stage state carries none here.
 */
@Component({
  selector: 'pb-stage-round',
  imports: [ApiUrlPipe, Icon, TranslocoPipe],
  host: { '[class.warn]': 'lastMinute()' },
  template: `
    <div class="stage-fit">
      <figure class="stage-square">
        <img
          [src]="round().targetUrl | apiUrl"
          [alt]="'stage.round.targetAlt' | transloco: { name: round().name }"
          width="1024"
          height="1024"
          fetchpriority="high"
        />
        <figcaption class="stage-label">{{ 'stage.round.target' | transloco }}</figcaption>
      </figure>
    </div>
    <div class="info fit-watch">
      <p class="stage-label">
        {{ (round().scored ? 'stage.round.scored' : 'stage.round.practice') | transloco }}
      </p>
      <h2 class="stage-title fit-title name">{{ round().name }}</h2>
      <div class="clock">
        <p class="stage-hero" role="timer">
          <span class="visually-hidden">{{ 'stage.round.timeLeft' | transloco }}</span>
          {{ display() }}
        </p>
        @if (seconds() === 0) {
          <p class="stage-text cue">{{ 'stage.round.timeUp' | transloco }}</p>
        } @else if (lastMinute()) {
          <p class="stage-text cue">
            <pb-icon name="timer" /> {{ 'stage.round.lastMinute' | transloco }}
          </p>
        }
      </div>
      <p class="stage-text counter">
        <pb-icon name="send" />
        <span>{{
          'stage.round.submissions'
            | transloco: { count: round().submissionsCount, total: playersCount() }
        }}</span>
      </p>
      <p class="stage-text stage-muted counter">
        <pb-icon name="image" />
        <span>{{ 'stage.round.attempts' | transloco: { count: round().attemptsCount } }}</span>
      </p>
    </div>
  `,
  styles: `
    @layer components {
      :host {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
        gap: var(--space-12);
        min-block-size: 0;
      }

      .info {
        display: grid;
        align-content: safe center;
        gap: var(--space-6);
      }

      .name {
        overflow-wrap: anywhere;
      }

      .clock {
        display: grid;
        gap: var(--space-2);
      }

      /* Shrinks with the scene's fit factor (D-026), never below the stage title size. */
      .clock .stage-hero {
        font-size: max(var(--text-stage-title), var(--text-stage-hero) * var(--stage-fit, 1));
        color: var(--syntax-function);
      }

      :host(.warn) .clock .stage-hero,
      .cue {
        color: var(--color-warning);
        font-weight: 700;
      }

      .counter {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
    }
  `,
})
export class StageRound {
  readonly round = input.required<Round>();
  readonly playersCount = input.required<number>();
  readonly serverOffset = input(0);

  protected readonly seconds = secondsLeft(
    () => this.round().endsAt,
    () => this.serverOffset(),
  );
  protected readonly lastMinute = computed(
    () => this.seconds() > 0 && this.seconds() <= LAST_MINUTE_SECONDS,
  );
  protected readonly display = computed(() => formatCountdown(this.seconds()));
}
