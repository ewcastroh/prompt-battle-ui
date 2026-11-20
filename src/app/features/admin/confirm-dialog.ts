import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiError } from '../../core/api/api-error';
import { ErrorMessage, errorMessage } from '../../core/api/error-messages';
import { Announcer } from '../../core/ui/announcer';
import { Icon } from '../../shared/icon/icon';

let nextId = 0;

/**
 * Confirmation for a consequential admin action (modern-web-guidance `dialog`): a native modal
 * `<dialog>` with the safe action focused first (Cancel), or the typed-confirmation field when
 * `typedConfirmation` is set (the event reset asks for `RESET`). The confirm button stays focusable;
 * until the text matches it explains why instead of calling `action`, so nothing is sent early.
 *
 * `action` runs while the dialog shows a busy state; on success the dialog closes (focus returns to
 * the button that opened it), on failure the error shows inside the dialog.
 */
@Component({
  selector: 'pb-confirm-dialog',
  imports: [Icon, TranslocoPipe],
  template: `
    <dialog
      #dialog
      class="admin-dialog"
      [attr.aria-labelledby]="ids.title"
      [attr.aria-describedby]="ids.body"
      (close)="onClose()"
    >
      <form class="dialog-body" novalidate (submit)="onSubmit($event)">
        <h2 class="dialog-title" [id]="ids.title">{{ heading() }}</h2>
        <div [id]="ids.body" class="dialog-text"><ng-content /></div>

        @if (typedConfirmation(); as expected) {
          <div class="field">
            <label class="field-label" [for]="ids.input">
              {{ 'admin.confirm.typeLabel' | transloco: { text: expected } }}
            </label>
            <input
              #typed
              class="text-input mono"
              type="text"
              [id]="ids.input"
              autocomplete="off"
              autocapitalize="characters"
              autocorrect="off"
              spellcheck="false"
              autofocus
              [attr.aria-invalid]="mismatch() ? 'true' : 'false'"
              [attr.aria-describedby]="mismatch() ? ids.error : null"
              (input)="typedValue.set(typed.value); mismatch.set(false)"
            />
            @if (mismatch()) {
              <p class="field-error" [id]="ids.error">
                <pb-icon name="circle-alert" />
                <span>{{ 'admin.confirm.typeMismatch' | transloco: { text: expected } }}</span>
              </p>
            }
          </div>
        }

        @if (error(); as message) {
          <p class="field-error" role="alert">
            <pb-icon name="circle-alert" />
            <span>{{ message.key | transloco: message.params }}</span>
          </p>
        }

        <div class="dialog-actions">
          <button
            type="button"
            class="btn"
            [attr.autofocus]="typedConfirmation() ? null : ''"
            (click)="close()"
          >
            {{ 'admin.confirm.cancel' | transloco }}
          </button>
          <button
            type="submit"
            class="btn"
            [class.btn-danger]="tone() === 'danger'"
            [class.btn-primary]="tone() !== 'danger'"
            [attr.aria-disabled]="busy() || !matches() ? 'true' : null"
          >
            {{ busy() ? ('admin.working' | transloco) : confirmLabel() }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class ConfirmDialog {
  private readonly announcer = inject(Announcer);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly heading = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly tone = input<'danger' | 'primary'>('danger');
  /** Text the admin must type to confirm (e.g. `RESET`); `null` for a plain confirmation. */
  readonly typedConfirmation = input<string | null>(null);
  /** The work to do on confirm; resolves to the error to show, or `null` to close. */
  readonly action = input.required<() => Promise<ApiError | null>>();

  private readonly suffix = nextId++;
  protected readonly ids = {
    title: `pb-confirm-title-${this.suffix}`,
    body: `pb-confirm-body-${this.suffix}`,
    input: `pb-confirm-input-${this.suffix}`,
    error: `pb-confirm-error-${this.suffix}`,
  };
  protected readonly typedValue = signal('');
  protected readonly mismatch = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<ErrorMessage | null>(null);
  private isOpen = false;

  /** True when no typed confirmation is needed, or the typed text matches exactly. */
  readonly matches = computed(() => {
    const expected = this.typedConfirmation();
    return expected === null || this.typedValue().trim() === expected;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.isOpen) {
        this.announcer.modalClosed();
      }
    });
  }

  open(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) {
      return;
    }
    this.typedValue.set('');
    this.mismatch.set(false);
    this.error.set(null);
    const field = dialog.querySelector('input');
    if (field) {
      field.value = '';
    }
    this.isOpen = true;
    this.announcer.modalOpened();
    dialog.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected onClose(): void {
    if (this.isOpen) {
      this.isOpen = false;
      this.announcer.modalClosed();
    }
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    if (!this.matches()) {
      this.mismatch.set(true);
      this.dialog().nativeElement.querySelector('input')?.focus();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const error = await this.action()();
    this.busy.set(false);
    if (error) {
      this.error.set(errorMessage(error));
    } else {
      this.close();
    }
  }
}
