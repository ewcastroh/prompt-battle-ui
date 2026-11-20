import { Component, computed, inject, input, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiUrlPipe } from '../../../core/api/api-url.pipe';
import { Reveal, RevealEntry } from '../../../core/api/api.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { Icon } from '../../../shared/icon/icon';
import { ConfettiBurst } from '../confetti-burst';
import { ScoreCountUp, formatScore } from '../score-count-up';

/** The rank step `step` reveals (API.md §4): step k shows rank size − k + 1, so 5, 4 … 1. */
export function rankAtStep(reveal: Pick<Reveal, 'size' | 'step'>): number | null {
  return reveal.step >= 1 && reveal.step <= reveal.size ? reveal.size - reveal.step + 1 : null;
}

/**
 * The entry this step shows, from the revealed entries only. `null` at the intro (step 0), and when
 * that entry was hidden after its reveal: its slot then stays empty (D-022).
 */
export function currentEntry(reveal: Reveal): RevealEntry | null {
  const rank = rankAtStep(reveal);
  return rank === null ? null : (reveal.entries.find((entry) => entry.rank === rank) ?? null);
}

/**
 * Mini-podium and final podium (SPEC §10.5): one entry per admin "Next". Rank, nickname, the prompt
 * the player typed (D-016), the entry beside its round's target (the final podium shows the
 * player's best entry, D-015), the score counting up (the event total on the final podium, the round
 * score on a mini-podium), and the commentary in the stage's language. #1 gets confetti when its
 * score lands, and a static celebration (trophy, accent frame) in any motion setting.
 *
 * Only `reveal.entries` is ever rendered: the API puts nothing unrevealed there (API.md §6).
 */
@Component({
  selector: 'pb-stage-reveal',
  imports: [ApiUrlPipe, ConfettiBurst, Icon, ScoreCountUp, TranslocoPipe],
  host: { '[class.winner]': 'isWinner()' },
  template: `
    @if (entry(); as e) {
      <header class="head">
        <p class="stage-hero rank">
          @if (isWinner()) {
            <pb-icon name="trophy" />
          }
          <span>#{{ e.rank }}</span>
        </p>
        <h2 class="stage-title fit-title nick">{{ e.nickname }}</h2>
        <div class="score">
          <p class="score-line">
            <span class="stage-label">{{ scoreLabelKey() | transloco }}</span>
            <pb-score-count-up
              class="stage-title value"
              [value]="score()"
              [key]="reveal().kind + ':' + reveal().step"
              (finished)="landed()"
            />
          </p>
          @if (reveal().kind === 'PODIUM') {
            <p class="stage-text fit-text stage-muted best">
              {{ 'stage.reveal.best' | transloco: { name: e.roundName, score: roundScore() } }}
            </p>
          }
        </div>
      </header>
      <div class="media">
        <div class="stage-pair">
          <figure class="stage-square">
            <img
              [src]="e.targetUrl | apiUrl"
              [alt]="'stage.reveal.targetAlt' | transloco: { name: e.roundName }"
              width="1024"
              height="1024"
            />
            <figcaption class="stage-label fit-text">
              {{ 'stage.reveal.target' | transloco }}
            </figcaption>
          </figure>
          <figure class="stage-square">
            <img
              [src]="e.imageUrl | apiUrl"
              [alt]="'stage.reveal.entryAlt' | transloco: { nickname: e.nickname }"
              width="1024"
              height="1024"
            />
            <figcaption class="stage-label fit-text">
              {{ 'stage.reveal.entry' | transloco }}
            </figcaption>
          </figure>
        </div>
        <div class="side fit-watch">
          <blockquote class="stage-text fit-text comment">{{ commentary() }}</blockquote>
        </div>
      </div>
      <p class="stage-text fit-text prompt">
        <span class="stage-label label">{{ 'stage.reveal.prompt' | transloco }}</span>
        <span class="text">{{ e.prompt }}</span>
      </p>
    } @else {
      <div class="stage-center intro">
        <p class="stage-label">{{ introLabelKey() | transloco }}</p>
        <h2 class="stage-title">{{ introTitleKey() | transloco: { size: reveal().size } }}</h2>
        @if (reveal().step > 0) {
          <p class="stage-text stage-muted">
            {{ 'stage.reveal.removed' | transloco: { rank: rankAtStep(reveal()) } }}
          </p>
        } @else {
          <ol class="slots" [attr.aria-label]="'stage.reveal.slotsLabel' | transloco">
            @for (rank of slots(); track rank) {
              <li class="stage-hero slot">#{{ rank }}</li>
            }
          </ol>
        }
      </div>
    }
    <pb-confetti-burst />
  `,
  styles: `
    @layer components {
      :host {
        display: grid;
        grid-template-rows: auto minmax(22vh, 1fr) auto;
        gap: clamp(var(--space-3), 2vh, var(--space-6));
        min-block-size: 0;
      }

      :host:has(.intro) {
        grid-template-rows: minmax(0, 1fr);
      }

      .head {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 0 var(--space-6);
      }

      .rank {
        display: inline-flex;
        align-items: center;
        gap: var(--space-3);
        font-size: var(--text-stage-title);
        color: var(--syntax-number);
      }

      .nick {
        overflow-wrap: anywhere;
      }

      .score {
        display: grid;
        justify-items: end;
        max-inline-size: min(50vw, 42rem);
        text-align: end;
      }

      .score p {
        margin: 0;
      }

      .score-line {
        display: flex;
        align-items: baseline;
        gap: var(--space-3);
      }

      .best {
        overflow-wrap: anywhere;
      }

      .value {
        font-weight: 700;
        color: var(--syntax-keyword);
      }

      .media {
        display: grid;
        grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
        gap: var(--space-8);
        min-block-size: 0;
      }

      .side {
        display: grid;
        align-content: safe center;
        min-block-size: 0;
      }

      blockquote {
        margin: 0;
        overflow-wrap: anywhere;
      }

      .comment {
        padding-inline-start: var(--space-4);
        border-inline-start: 0.375rem solid var(--syntax-string);
        font-weight: 700;
      }

      .prompt {
        max-inline-size: none;
        padding: var(--space-2) var(--space-4);
        border: var(--border-width) solid var(--color-border-strong);
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
      }

      .prompt .label {
        font-size: inherit;
        margin-inline-end: var(--space-3);
      }

      .prompt .text {
        overflow-wrap: anywhere;
      }

      .slots {
        max-inline-size: none;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--space-6);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .slot {
        padding: var(--space-2) var(--space-6);
        border: 0.25rem dashed var(--color-border-strong);
        border-radius: var(--radius-md);
        font-size: var(--text-stage-title);
        color: var(--color-text-muted);
      }

      :host(.winner) .stage-pair .stage-square:last-child > img {
        border: 0.5rem solid var(--syntax-number);
      }

      @media (prefers-reduced-motion: no-preference) {
        .comment {
          animation: pb-fade-in var(--duration-slow) var(--ease-out) var(--duration-score) both;
        }

        .stage-pair .stage-square:last-child {
          animation: pb-rise var(--duration-slow) var(--ease-out) both;
        }
      }

      @keyframes pb-fade-in {
        from {
          opacity: 0;
        }
      }

      @keyframes pb-rise {
        from {
          opacity: 0;
          translate: 0 1.5rem;
        }
      }
    }
  `,
})
export class StageReveal {
  private readonly language = inject(LanguageService);
  private readonly confetti = viewChild.required(ConfettiBurst);
  private celebrated: string | null = null;

  readonly reveal = input.required<Reveal>();
  /** Key of this reveal run (city, kind, round), so a podium reset can celebrate again. */
  readonly runKey = input('');

  protected readonly rankAtStep = rankAtStep;
  protected readonly entry = computed(() => currentEntry(this.reveal()));
  protected readonly isWinner = computed(() => this.entry()?.rank === 1);
  protected readonly score = computed(() => {
    const entry = this.entry();
    if (!entry) {
      return 0;
    }
    return this.reveal().kind === 'PODIUM' ? (entry.total ?? entry.roundScore) : entry.roundScore;
  });
  protected readonly roundScore = computed(() => {
    this.language.language();
    return formatScore(this.entry()?.roundScore ?? 0, this.language.localeTag());
  });
  protected readonly commentary = computed(() => {
    const entry = this.entry();
    return entry ? entry.commentary[this.language.language()] : '';
  });
  protected readonly scoreLabelKey = computed(() =>
    this.reveal().kind === 'PODIUM' ? 'stage.reveal.total' : 'stage.reveal.score',
  );
  protected readonly introLabelKey = computed(() =>
    this.reveal().kind === 'PODIUM' ? 'stage.reveal.podiumLabel' : 'stage.reveal.miniLabel',
  );
  protected readonly introTitleKey = computed(() =>
    this.reveal().kind === 'PODIUM' ? 'stage.reveal.podiumTitle' : 'stage.reveal.miniTitle',
  );
  protected readonly slots = computed(() =>
    Array.from({ length: this.reveal().size }, (_, i) => this.reveal().size - i),
  );

  /** The score has landed: #1 gets its confetti, once per reveal run. */
  protected landed(): void {
    const entry = this.entry();
    const key = `${this.runKey()}:${this.reveal().kind}:${entry?.nickname ?? ''}`;
    if (entry?.rank === 1 && this.celebrated !== key) {
      this.celebrated = key;
      void this.confetti().fire();
    }
  }
}
