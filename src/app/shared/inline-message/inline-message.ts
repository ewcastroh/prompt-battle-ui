import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon, IconName } from '../icon/icon';

export type MessageTone = 'info' | 'success' | 'warning' | 'danger';

const TONE_ICONS: Readonly<Record<MessageTone, IconName>> = {
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-alert',
};

/**
 * Inline message (DESIGN.md §7 "Toast / inline message"): icon + text in a semantic color, with an
 * optional dismiss button and an `actions` slot. It is never the only place a critical error appears,
 * and it is not a live region: whoever shows it announces it through the `Announcer` when needed.
 * Warnings and errors start with a visually hidden "Warning:" / "Error:" so the tone is not color only.
 */
@Component({
  selector: 'pb-inline-message',
  imports: [Icon, TranslocoPipe],
  host: { '[class]': "'tone-' + tone()" },
  template: `
    <pb-icon class="icon" [name]="icon()" />
    <div class="body">
      <p class="text">
        @if (prefixKey(); as key) {
          <span class="visually-hidden">{{ key | transloco }}</span>
        }
        <ng-content />
      </p>
      <ng-content select="[actions]" />
    </div>
    @if (dismissLabel(); as label) {
      <button type="button" class="dismiss" (click)="dismissed.emit()">
        <pb-icon name="x" />
        <span class="visually-hidden">{{ label }}</span>
      </button>
    }
  `,
  styles: `
    @layer components {
      :host {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        padding: var(--space-3);
        border: var(--border-width) solid currentColor;
        border-inline-start-width: 0.375rem;
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
        color: var(--color-text);
      }

      :host(.tone-info) {
        border-color: var(--color-info);
      }
      :host(.tone-success) {
        border-color: var(--color-success);
      }
      :host(.tone-warning) {
        border-color: var(--color-warning);
      }
      :host(.tone-danger) {
        border-color: var(--color-danger);
      }

      .icon {
        margin-block-start: 0.125rem;
      }
      :host(.tone-info) .icon {
        color: var(--color-info);
      }
      :host(.tone-success) .icon {
        color: var(--color-success);
      }
      :host(.tone-warning) .icon {
        color: var(--color-warning);
      }
      :host(.tone-danger) .icon {
        color: var(--color-danger);
      }

      .body {
        display: grid;
        gap: var(--space-2);
        flex: 1;
        min-inline-size: 0;
      }

      .text {
        margin: 0;
        overflow-wrap: break-word;
      }

      .dismiss {
        display: inline-grid;
        place-items: center;
        flex: none;
        min-inline-size: var(--tap-target);
        min-block-size: var(--tap-target);
        margin-block: calc(-1 * var(--space-2));
        margin-inline-end: calc(-1 * var(--space-2));
        padding: 0;
        border: 0;
        border-radius: var(--radius-md);
        background: none;
        color: var(--color-text-muted);
      }

      @media (hover: hover) and (pointer: fine) {
        .dismiss:hover {
          background-color: var(--color-bg);
          color: var(--color-text);
        }
      }
    }
  `,
})
export class InlineMessage {
  readonly tone = input<MessageTone>('info');
  /** Translated accessible name of the dismiss button; no button when `null`. */
  readonly dismissLabel = input<string | null>(null);
  readonly dismissed = output<void>();

  protected readonly icon = computed(() => TONE_ICONS[this.tone()]);
  protected readonly prefixKey = computed(() => {
    const tone = this.tone();
    return tone === 'danger'
      ? 'common.errorPrefix'
      : tone === 'warning'
        ? 'common.warningPrefix'
        : null;
  });
}
