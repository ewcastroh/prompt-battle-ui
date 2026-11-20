import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { ErrorMessage, errorMessage } from '../../../core/api/error-messages';
import { Icon } from '../../../shared/icon/icon';
import { InlineMessage } from '../../../shared/inline-message/inline-message';
import { AdminSessionService, LoginError } from '../admin-session.service';

/** What a failed login shows, as a translation key and params. */
export function loginErrorMessage(error: LoginError, routeCityName: string): ErrorMessage {
  if (error.kind === 'city-mismatch') {
    return {
      key: 'admin.login.cityMismatch',
      params: { tokenCity: error.tokenCityName, city: routeCityName, code: error.tokenCity },
    };
  }
  return error.error.code === 'UNAUTHORIZED'
    ? { key: 'admin.login.invalid', params: {} }
    : errorMessage(error.error);
}

/**
 * Admin token login, bound to the route's city (SPEC §10.1): the token is checked with
 * `/api/admin/me` and refused when it belongs to another city. A password-type field with a
 * show/hide toggle (modern-web-guidance `forms`); paste is allowed. Errors are linked to the field
 * and the field gets focus.
 */
@Component({
  selector: 'pb-admin-login',
  imports: [FormField, Icon, InlineMessage, TranslocoPipe],
  template: `
    @if (reasonKey(); as key) {
      <pb-inline-message [tone]="reasonTone()">{{ key | transloco }}</pb-inline-message>
    }
    <section class="window" aria-labelledby="admin-login-title">
      <p class="window-bar">~/{{ cityCode() }}/admin.token</p>
      <form class="window-body" novalidate (submit)="onSubmit($event)">
        <h2 id="admin-login-title">
          {{ 'admin.login.heading' | transloco: { city: cityName() } }}
        </h2>
        <p class="admin-hint">{{ 'admin.login.intro' | transloco: { city: cityName() } }}</p>
        <div class="field">
          <label class="field-label" for="admin-token">{{ 'admin.login.label' | transloco }}</label>
          <div class="token-row">
            <input
              #token
              id="admin-token"
              class="text-input mono"
              [type]="showToken() ? 'text' : 'password'"
              [formField]="loginForm.token"
              autocomplete="current-password"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="go"
              [attr.aria-invalid]="message() ? 'true' : 'false'"
              [attr.aria-describedby]="message() ? 'admin-token-error' : null"
            />
            <button
              type="button"
              class="btn reveal"
              [attr.aria-pressed]="showToken()"
              (click)="showToken.set(!showToken())"
            >
              <pb-icon [name]="showToken() ? 'eye-off' : 'eye'" />
              <span class="visually-hidden">{{ 'admin.login.show' | transloco }}</span>
            </button>
          </div>
          @if (message(); as error) {
            <p class="field-error" id="admin-token-error">
              <pb-icon name="circle-alert" />
              <span
                ><span class="visually-hidden">{{ 'common.errorPrefix' | transloco }}</span
                >{{ error.key | transloco: error.params }}</span
              >
            </p>
          }
        </div>
        <button type="submit" class="btn btn-primary" [attr.aria-disabled]="busy() ? 'true' : null">
          {{ (busy() ? 'admin.login.checking' : 'admin.login.submit') | transloco }}
        </button>
      </form>
    </section>
  `,
  styles: `
    @layer components {
      :host {
        display: grid;
        gap: var(--space-4);
        max-inline-size: 36rem;
      }

      h2 {
        margin: 0;
      }

      .token-row {
        display: flex;
        gap: var(--space-2);
      }

      .token-row .text-input {
        flex: 1;
        min-inline-size: 0;
      }

      .reveal {
        flex: none;
        min-block-size: 3rem;
      }
    }
  `,
})
export class AdminLogin {
  private readonly session = inject(AdminSessionService);
  private readonly tokenInput = viewChild.required<ElementRef<HTMLInputElement>>('token');

  readonly cityCode = input.required<string>();
  readonly cityName = input.required<string>();

  protected readonly model = signal({ token: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.token);
  });
  protected readonly busy = signal(false);
  protected readonly showToken = signal(false);
  private readonly failure = signal<ErrorMessage | null>(null);
  private readonly submitted = signal(false);

  protected readonly message = computed<ErrorMessage | null>(() => {
    const failure = this.failure();
    if (failure) {
      return failure;
    }
    return this.submitted() && this.loginForm.token().invalid()
      ? { key: 'admin.login.required', params: {} }
      : null;
  });

  protected readonly reasonKey = computed(() => {
    const session = this.session.session();
    const reason = session.kind === 'login' ? session.reason : null;
    return reason ? `admin.login.reason.${reason}` : null;
  });
  protected readonly reasonTone = computed(() =>
    this.reasonKey() === 'admin.login.reason.UNAUTHORIZED' ? 'warning' : 'info',
  );

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    this.failure.set(null);
    const valid = await submit(this.loginForm, async () => {
      this.busy.set(true);
      const error = await this.session.login(this.model().token);
      this.busy.set(false);
      if (error) {
        this.failure.set(loginErrorMessage(error, this.cityName()));
      }
      return undefined;
    });
    this.submitted.set(true);
    if (!valid || this.failure()) {
      this.tokenInput().nativeElement.focus();
    }
  }
}
