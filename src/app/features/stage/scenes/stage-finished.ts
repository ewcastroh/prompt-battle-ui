import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StageState } from '../../../core/api/api.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { Icon } from '../../../shared/icon/icon';
import { formatScore } from '../score-count-up';

/**
 * After #1 (SPEC §3.5, §10.5): the city's final podium as a list, and each scored round's hidden
 * reference prompt ("El prompt original era…"). No new player images appear here.
 */
@Component({
  selector: 'pb-stage-finished',
  imports: [Icon, TranslocoPipe],
  template: `
    <section class="podium" aria-labelledby="stage-podium-title">
      <h2 id="stage-podium-title" class="stage-title fit-title">
        <pb-icon name="trophy" /> {{ 'stage.finished.podium' | transloco }}
      </h2>
      <ol class="ranking">
        @for (row of ranking(); track row.rank) {
          <li class="row fit-text" [class.first]="row.rank === 1">
            <span class="rank">#{{ row.rank }}</span>
            <span class="nick">{{ row.nickname }}</span>
            <span class="total">{{ row.total }}</span>
          </li>
        }
      </ol>
    </section>
    <section class="prompts" aria-labelledby="stage-prompts-title">
      <h2 id="stage-prompts-title" class="stage-title fit-title">
        {{ 'stage.finished.prompts' | transloco }}
      </h2>
      <dl class="list">
        @for (item of state().hiddenPrompts ?? []; track item.roundId) {
          <div class="item">
            <dt class="stage-label fit-text">{{ item.roundName }}</dt>
            <dd class="stage-text fit-text prompt">{{ item.prompt }}</dd>
          </div>
        }
      </dl>
    </section>
  `,
  styles: `
    @layer components {
      :host {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
        gap: clamp(var(--space-6), 3vw, var(--space-12));
        align-content: safe center;
        min-block-size: 0;
      }

      section {
        display: grid;
        align-content: start;
        gap: var(--space-6);
        min-inline-size: 0;
      }

      h2 pb-icon {
        color: var(--syntax-number);
      }

      .ranking,
      .list {
        display: grid;
        gap: var(--space-3);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: baseline;
        gap: var(--space-4);
        padding: var(--space-2) var(--space-4);
        border: var(--border-width) solid var(--color-border);
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
      }

      .row.first {
        border: 0.25rem solid var(--syntax-number);
      }

      .rank,
      .total {
        font-family: var(--font-mono);
        font-size-adjust: from-font;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      .rank {
        color: var(--syntax-number);
      }

      .total {
        color: var(--syntax-keyword);
      }

      .nick {
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .item {
        display: grid;
        gap: var(--space-1);
        padding-inline-start: var(--space-4);
        border-inline-start: 0.375rem solid var(--syntax-string);
      }

      .prompt {
        margin: 0;
        overflow-wrap: anywhere;
      }
    }
  `,
})
export class StageFinished {
  private readonly language = inject(LanguageService);
  readonly state = input.required<StageState>();

  protected readonly ranking = computed(() => {
    this.language.language();
    const locale = this.language.localeTag();
    return [...(this.state().reveal?.entries ?? [])]
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => ({
        rank: entry.rank,
        nickname: entry.nickname,
        total: formatScore(entry.total ?? entry.roundScore, locale),
      }));
  });
}
