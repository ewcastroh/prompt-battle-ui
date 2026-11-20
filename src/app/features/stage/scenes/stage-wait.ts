import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StageState } from '../../../core/api/api.models';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';

export type WaitKind = 'closing' | 'scored' | 'final-scoring';

/**
 * The in-between scenes: round closing and scoring ("La IA está evaluando…", SPEC §10.5), scores
 * ready, and the final podium being prepared. The spinner is the only motion and it stops with the
 * phase (DESIGN.md §8).
 */
@Component({
  selector: 'pb-stage-wait',
  imports: [Icon, Spinner, TranslocoPipe],
  host: { class: 'stage-center' },
  template: `
    @if (kind() === 'scored') {
      <pb-icon class="icon" name="trophy" />
    } @else {
      <pb-spinner labelledBy="stage-wait-title" />
    }
    <h2 id="stage-wait-title" class="stage-title">{{ titleKey() | transloco }}</h2>
    @if (state().round; as round) {
      <p class="stage-text fit-text stage-muted">
        {{ 'stage.wait.round' | transloco: { name: round.name, count: round.submissionsCount } }}
      </p>
    } @else if (kind() === 'final-scoring') {
      <p class="stage-text stage-muted">{{ 'stage.wait.finalHint' | transloco }}</p>
    }
  `,
  styles: `
    @layer components {
      :host {
        min-block-size: 0;
      }

      .icon {
        --icon-size: clamp(5rem, 3rem + 6vw, 10rem);
        color: var(--syntax-number);
      }
    }
  `,
})
export class StageWait {
  readonly state = input.required<StageState>();
  readonly kind = input.required<WaitKind>();

  protected readonly titleKey = computed(() => {
    switch (this.kind()) {
      case 'closing':
        return this.state().round?.scored === false
          ? 'stage.wait.practiceClosing'
          : 'stage.wait.scoring';
      case 'scored':
        return 'stage.wait.scored';
      case 'final-scoring':
        return 'stage.wait.finalScoring';
    }
  });
}
