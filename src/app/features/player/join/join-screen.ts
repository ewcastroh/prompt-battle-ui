import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormField, form, maxLength, required, submit, validate } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApiError } from '../../../core/api/api-error';
import { ErrorMessage, errorMessage } from '../../../core/api/error-messages';
import { Announcer } from '../../../core/ui/announcer';
import { Icon } from '../../../shared/icon/icon';
import { InlineMessage } from '../../../shared/inline-message/inline-message';
import { JoinReason } from '../player-screen';
import { PlayerStateService } from '../player-state.service';
import { NICKNAME_MAX, NICKNAME_MIN, nicknameProblem } from './nickname-rules';

/** API errors about the nickname itself: shown on the field, which gets focus. */
const NICKNAME_CODES: ReadonlySet<string> = new Set([
  'NICKNAME_INVALID',
  'NICKNAME_TAKEN',
  'NICKNAME_BLOCKED',
]);

/**
 * Join (SPEC §10.4, §6.1): event title (header), nickname field, privacy notice, "Join".
 *
 * Validation follows modern-web-guidance `forms`: the rule is a hint above the field; errors show
 * after the player edits and leaves the field, or on submit, and clear as soon as the value is fixed;
 * `aria-invalid` and the error link change together. A failed submit focuses the field; request
 * errors (network, rate limit) are announced politely.
 */
@Component({
  selector: 'pb-join-screen',
  imports: [FormField, Icon, InlineMessage, TranslocoPipe],
  templateUrl: './join-screen.html',
  styleUrl: './join-screen.css',
})
export class JoinScreen {
  private readonly state = inject(PlayerStateService);
  private readonly announcer = inject(Announcer);
  private readonly transloco = inject(TranslocoService);
  private readonly nicknameInput = viewChild.required<ElementRef<HTMLInputElement>>('nickname');

  readonly cityCode = input.required<string>();
  readonly cityName = input<string | null>(null);
  /** Why the player is back on this form (session ended), if so. */
  readonly reason = input<JoinReason | null>(null);

  protected readonly ids = {
    input: 'join-nickname',
    hint: 'join-nickname-hint',
    privacy: 'join-privacy',
    error: 'join-nickname-error',
  };

  protected readonly model = signal({ nickname: '' });
  protected readonly joinForm = form(this.model, (path) => {
    required(path.nickname);
    maxLength(path.nickname, NICKNAME_MAX);
    validate(path.nickname, ({ value }) => {
      const problem = value() === '' ? null : nicknameProblem(value());
      return problem ? { kind: problem } : undefined;
    });
  });

  protected readonly joining = signal(false);
  private readonly submitAttempted = signal(false);
  private readonly requestError = signal<{ error: ApiError; nickname: string } | null>(null);
  private announcedError: string | null = null;

  /** Error on the field: client rules after interaction, or the API rejecting this nickname. */
  protected readonly fieldError = computed<ErrorMessage | null>(() => {
    const request = this.requestError();
    const value = this.model().nickname;
    if (request && request.nickname === value && NICKNAME_CODES.has(request.error.code)) {
      return errorMessage(request.error);
    }
    const field = this.joinForm.nickname();
    if (!(this.submitAttempted() || (field.dirty() && field.touched()))) {
      return null;
    }
    const kinds = field.errors().map((error) => error.kind);
    if (kinds.includes('required')) {
      return { key: 'player.join.errorRequired', params: {} };
    }
    if (kinds.includes('invalid')) {
      return { key: 'errors.NICKNAME_INVALID', params: { min: NICKNAME_MIN, max: NICKNAME_MAX } };
    }
    return null;
  });

  /** A request error that is not about the nickname (network, rate limit…). */
  protected readonly requestMessage = computed<ErrorMessage | null>(() => {
    const request = this.requestError();
    return request && !NICKNAME_CODES.has(request.error.code) ? errorMessage(request.error) : null;
  });

  protected readonly reasonMessage = computed<ErrorMessage | null>(() => {
    const reason = this.reason();
    return reason ? { key: `errors.${reason}`, params: {} } : null;
  });

  protected readonly describedBy = computed(() =>
    [this.ids.hint, this.ids.privacy, ...(this.fieldError() ? [this.ids.error] : [])].join(' '),
  );

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.joining()) {
      return;
    }
    this.requestError.set(null);
    const valid = await submit(this.joinForm, async () => {
      const nickname = this.model().nickname;
      this.joining.set(true);
      const error = await this.state.join(nickname.trim());
      this.joining.set(false);
      if (error) {
        this.requestError.set({ error, nickname });
      }
      return undefined;
    });
    this.submitAttempted.set(!valid);
    const request = this.requestError();
    if (!valid || (request && NICKNAME_CODES.has(request.error.code))) {
      // The field's error is read with it (aria-describedby): no separate announcement.
      this.announcedError = this.errorText();
      this.nicknameInput().nativeElement.focus();
    } else if (request) {
      this.announcer.announce(this.translate(errorMessage(request.error)));
    }
  }

  /** On blur, announce a newly shown error a moment later (after the next focus is read). */
  protected onBlur(): void {
    const text = this.errorText();
    if (text && text !== this.announcedError) {
      this.announcedError = text;
      const label = this.transloco.translate('player.join.nicknameLabel');
      this.announcer.announce(`${label}: ${text}`, 500);
    } else if (!text) {
      this.announcedError = null;
    }
  }

  private errorText(): string | null {
    const error = this.fieldError();
    return error ? this.translate(error) : null;
  }

  private translate(message: ErrorMessage): string {
    return this.transloco.translate(message.key, message.params);
  }
}
