import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ErrorMessage } from '../../../core/api/error-messages';
import { Icon } from '../../../shared/icon/icon';

let nextId = 0;

/**
 * Generate button (DESIGN.md §7): the form's primary submit button, full width on phones.
 *
 * While a generation is in flight, or no attempts are left, it is `aria-disabled` rather than
 * `disabled`, so it stays focusable and screen-reader users hear why (the visible reason is linked
 * with `aria-describedby`). The form's submit handler ignores activation in those states.
 * Validation problems (empty, repeated prompt) never disable it: pressing shows them.
 */
@Component({
  selector: 'pb-generate-button',
  imports: [Icon, TranslocoPipe],
  template: `
    <button
      type="submit"
      class="btn btn-primary btn-block"
      [attr.aria-disabled]="reason() ? 'true' : null"
      [attr.aria-describedby]="reason() ? reasonId : null"
    >
      <pb-icon [name]="sending() ? 'loader-circle' : 'sparkles'" />
      {{
        (sending() ? 'player.round.generate.sending' : 'player.round.generate.label') | transloco
      }}
    </button>
    @if (reason(); as message) {
      <p class="reason" [id]="reasonId">
        <pb-icon name="info" />
        <span>{{ message.key | transloco: message.params }}</span>
      </p>
    }
  `,
  styles: `
    @layer components {
      :host {
        display: grid;
        gap: var(--space-2);
      }

      .reason {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        margin: 0;
        color: var(--color-text-muted);
      }

      .reason pb-icon {
        margin-block-start: 0.125rem;
        color: var(--syntax-function);
      }
    }
  `,
})
export class GenerateButton {
  /** Why generating is unavailable right now, or `null` when it is available. */
  readonly reason = input<ErrorMessage | null>(null);
  /** True while the prompt is being sent. */
  readonly sending = input(false);

  protected readonly reasonId = `pb-generate-reason-${nextId++}`;
}
