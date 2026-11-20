import { Component, DOCUMENT, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiError } from '../../../core/api/api-error';
import { ErrorMessage, errorMessage } from '../../../core/api/error-messages';
import { Icon } from '../../../shared/icon/icon';
import { InlineMessage } from '../../../shared/inline-message/inline-message';
import { AdminApi } from '../admin-api';
import { AdminRoundsService } from '../admin-rounds.service';
import { AdminSessionService } from '../admin-session.service';
import { ConfirmDialog } from '../confirm-dialog';

/** The text the admin types to confirm the event reset (API.md §7 `{"confirm":"RESET"}`). */
export const RESET_WORD = 'RESET';

/**
 * Event tools (SPEC §10.6): the own city's results as CSV (fetched with the token, saved from a
 * blob with the server's file name), and the event reset for every city, behind a typed `RESET`
 * confirmation. After a reset every token stops working, so the console signs out.
 */
@Component({
  selector: 'pb-admin-event',
  imports: [ConfirmDialog, Icon, InlineMessage, TranslocoPipe],
  template: `
    <div class="section-head">
      <h2>{{ 'admin.event.title' | transloco }}</h2>
    </div>

    <div class="block">
      <p class="admin-hint">{{ 'admin.event.csvHint' | transloco }}</p>
      <button
        type="button"
        class="btn"
        [attr.aria-disabled]="downloading() ? 'true' : null"
        (click)="download()"
      >
        <pb-icon name="download" />
        {{ (downloading() ? 'admin.working' : 'admin.event.csv') | transloco }}
      </button>
    </div>

    @if (error(); as message) {
      <pb-inline-message
        tone="danger"
        [dismissLabel]="'admin.dismiss' | transloco"
        (dismissed)="error.set(null)"
      >
        {{ message.key | transloco: message.params }}
      </pb-inline-message>
    }

    <div class="block danger-zone">
      <p class="admin-hint">{{ 'admin.event.resetHint' | transloco }}</p>
      <button type="button" class="btn btn-danger" (click)="resetDialog.open()">
        <pb-icon name="trash-2" />
        {{ 'admin.event.reset' | transloco }}
      </button>
    </div>

    <pb-confirm-dialog
      #resetDialog
      [heading]="'admin.event.resetTitle' | transloco"
      [confirmLabel]="'admin.event.reset' | transloco"
      [typedConfirmation]="resetWord"
      [action]="resetAction"
    >
      <p>{{ 'admin.event.resetBody' | transloco }}</p>
    </pb-confirm-dialog>
  `,
  styles: `
    @layer components {
      .block {
        display: grid;
        justify-items: start;
        gap: var(--space-2);
      }

      .danger-zone {
        padding-block-start: var(--space-4);
        border-block-start: var(--border-width) solid var(--color-border);
      }
    }
  `,
})
export class AdminEvent {
  private readonly api = inject(AdminApi);
  private readonly session = inject(AdminSessionService);
  private readonly rounds = inject(AdminRoundsService);
  private readonly document = inject(DOCUMENT);

  protected readonly resetWord = RESET_WORD;
  protected readonly downloading = signal(false);
  protected readonly error = signal<ErrorMessage | null>(null);

  protected readonly resetAction = async (): Promise<ApiError | null> => {
    try {
      await this.api.resetEvent(RESET_WORD);
      this.session.logout('RESET');
      return null;
    } catch (error) {
      return error instanceof ApiError ? error : new ApiError(0, 'UNKNOWN');
    }
  };

  /** `fetch` → blob → a temporary object URL on a `download` link (API.md §7). */
  protected async download(): Promise<void> {
    if (this.downloading()) {
      return;
    }
    this.downloading.set(true);
    this.error.set(null);
    try {
      const file = await this.api.resultsCsv(this.rounds.city());
      const url = URL.createObjectURL(file.blob);
      const link = this.document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.hidden = true;
      this.document.body.append(link);
      link.click();
      link.remove();
      // Give the browser time to start the download before the URL goes away.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.downloading.set(false);
    }
  }
}
