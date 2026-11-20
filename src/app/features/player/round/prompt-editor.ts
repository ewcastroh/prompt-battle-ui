import { Component, computed, input } from '@angular/core';
import { FieldTree, FormField } from '@angular/forms/signals';
import { TranslocoPipe } from '@jsverse/transloco';
import { ErrorMessage } from '../../../core/api/error-messages';
import { Icon } from '../../../shared/icon/icon';
import { PROMPT_MAX_LENGTH, counterLevel, promptLength } from '../prompt-text';

let nextId = 0;

/**
 * Prompt editor (DESIGN.md §7): a `<textarea>` in the body font inside editor chrome, with a title
 * bar (`prompt.txt`, the visible label) and a status bar with the character counter and attempts
 * left, both linked to the field with `aria-describedby` (the counter is not a live region).
 *
 * - The 300 limit is the native `maxlength` (bound by Signal Forms from the schema), so the counter
 *   counts what the field counts and warns near the end with text, not only color.
 * - Enter inserts a new line: there is no key handler, so IME composition is never cut short.
 * - The field grows with its text (`field-sizing: content`) up to ten lines, then scrolls.
 */
@Component({
  selector: 'pb-prompt-editor',
  imports: [FormField, Icon, TranslocoPipe],
  template: `
    <div class="editor" [class.invalid]="error() !== null">
      <label class="title-bar" [for]="inputId">
        <span class="file" aria-hidden="true">
          <span class="dot"></span>{{ 'player.round.editor.file' | transloco }}
        </span>
        <span class="label">{{ 'player.round.editor.label' | transloco }}</span>
      </label>
      <textarea
        class="textarea"
        rows="4"
        [id]="inputId"
        [formField]="field()"
        [attr.placeholder]="
          field()().readonly() ? null : ('player.round.editor.placeholder' | transloco)
        "
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="error() ? 'true' : 'false'"
      ></textarea>
      <div class="status-bar">
        <span class="counter" [id]="counterId" [class]="'level-' + level()">
          <span class="visually-hidden">{{ 'player.round.editor.counterLabel' | transloco }}</span>
          {{ 'player.round.editor.counter' | transloco: { count: length(), max: max } }}
          @if (level() === 'full') {
            <span class="cue">· {{ 'player.round.editor.counterFull' | transloco }}</span>
          } @else if (level() === 'warn') {
            <span class="cue"
              >·
              {{ 'player.round.editor.counterLeft' | transloco: { count: max - length() } }}</span
            >
          }
        </span>
        <span class="attempts" [id]="attemptsId">
          {{ 'player.round.editor.attemptsLeft' | transloco: { count: attemptsLeft() } }}
        </span>
      </div>
    </div>
    @if (error(); as message) {
      <p class="field-error" [id]="errorId">
        <pb-icon name="circle-alert" />
        <span
          ><span class="visually-hidden">{{ 'common.errorPrefix' | transloco }}</span
          >{{ message.key | transloco: message.params }}</span
        >
      </p>
    } @else if (notice(); as message) {
      <p class="notice" [id]="noticeId">
        <pb-icon name="triangle-alert" />
        <span>{{ message.key | transloco: message.params }}</span>
      </p>
    }
  `,
  styleUrl: './prompt-editor.css',
})
export class PromptEditor {
  /** The prompt field of the round's Signal Form. */
  readonly field = input.required<FieldTree<string>>();
  readonly attemptsLeft = input.required<number>();
  /** Error to show and link (sets `aria-invalid`), or `null`. */
  readonly error = input<ErrorMessage | null>(null);
  /** Warning shown under the field when there is no error (e.g. a repeated prompt). */
  readonly notice = input<ErrorMessage | null>(null);

  private readonly uid = `pb-prompt-${nextId++}`;
  protected readonly inputId = `${this.uid}-input`;
  protected readonly counterId = `${this.uid}-counter`;
  protected readonly attemptsId = `${this.uid}-attempts`;
  protected readonly errorId = `${this.uid}-error`;
  protected readonly noticeId = `${this.uid}-notice`;
  protected readonly max = PROMPT_MAX_LENGTH;

  protected readonly length = computed(() => promptLength(this.field()().value()));
  protected readonly level = computed(() => counterLevel(this.length()));
  protected readonly describedBy = computed(() => {
    const ids = [this.counterId, this.attemptsId];
    if (this.error()) {
      ids.push(this.errorId);
    } else if (this.notice()) {
      ids.push(this.noticeId);
    }
    return ids.join(' ');
  });
}
