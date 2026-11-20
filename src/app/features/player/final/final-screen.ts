import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Me } from '../../../core/api/api.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { Icon } from '../../../shared/icon/icon';

/** A total with one decimal in the active locale ("143,2" in es-CO, "143.2" in en). */
export function formatTotal(total: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(total);
}

/**
 * Final result (SPEC §3.5, §10.4): the player's own rank in their city and their total. Podium
 * players see "You're on the podium! Show your code {claimCode}". Players without an entry have no
 * rank (`rank: null`).
 */
@Component({
  selector: 'pb-final-screen',
  imports: [Icon, TranslocoPipe],
  template: `
    @if (me().final; as result) {
      @if (result.podium) {
        <section class="podium">
          <pb-icon class="trophy" name="trophy" />
          <h2 class="podium-text">
            {{ 'player.final.podium' | transloco: { claimCode: me().player.claimCode } }}
          </h2>
          <p class="code mono" aria-hidden="true">{{ me().player.claimCode }}</p>
        </section>
      }
      <section class="window">
        <p class="window-bar">~/{{ me().player.city }}/{{ 'player.final.file' | transloco }}</p>
        <div class="window-body">
          @if (result.rank !== null) {
            <dl class="stats">
              <div class="stat">
                <dt>{{ 'player.final.rankLabel' | transloco: { city: me().player.cityName } }}</dt>
                <dd class="value mono">
                  {{ 'player.final.rank' | transloco: { rank: result.rank } }}
                </dd>
              </div>
              <div class="stat">
                <dt>{{ 'player.final.totalLabel' | transloco }}</dt>
                <dd class="value mono">
                  {{ 'player.final.total' | transloco: { total: total() } }}
                </dd>
              </div>
            </dl>
          } @else {
            <p>{{ 'player.final.noRank' | transloco }}</p>
          }
          <p class="thanks">{{ 'player.final.thanks' | transloco }}</p>
        </div>
      </section>
    }
  `,
  styles: `
    @layer components {
      :host {
        display: grid;
        gap: var(--space-6);
      }

      .podium {
        display: grid;
        justify-items: center;
        gap: var(--space-3);
        padding: var(--space-6) var(--space-4);
        border: 3px solid var(--color-success);
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
        text-align: center;
      }

      .trophy {
        --icon-size: 3rem;
        color: var(--syntax-number);
      }

      .podium-text {
        margin: 0;
        font-size: var(--text-xl);
      }

      .code {
        margin: 0;
        padding: var(--space-2) var(--space-6);
        border: 2px dashed var(--color-border-strong);
        border-radius: var(--radius-md);
        font-size: clamp(2.5rem, 2rem + 4vw, 4rem);
        font-weight: 800;
        letter-spacing: 0.15em;
        line-height: 1.1;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
        gap: var(--space-4);
        margin: 0;
      }

      .stat {
        display: grid;
        gap: var(--space-1);
      }

      dt {
        color: var(--color-text-muted);
        font-weight: 600;
      }

      dd {
        margin: 0;
      }

      .value {
        font-size: clamp(2rem, 1.5rem + 3vw, 3rem);
        font-weight: 800;
        line-height: 1.1;
        overflow-wrap: anywhere;
      }

      .thanks {
        font-weight: 700;
      }
    }
  `,
})
export class FinalScreen {
  private readonly language = inject(LanguageService);

  readonly me = input.required<Me>();

  protected readonly total = computed(() => {
    this.language.language();
    return formatTotal(this.me().final?.total ?? 0, this.language.localeTag());
  });
}
