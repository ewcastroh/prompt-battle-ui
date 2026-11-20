import {
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { form, maxLength, readonly, required, submit, validate } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApiError } from '../../../core/api/api-error';
import { Attempt, Me } from '../../../core/api/api.models';
import { ErrorMessage, errorMessage } from '../../../core/api/error-messages';
import { Announcer } from '../../../core/ui/announcer';
import { Icon } from '../../../shared/icon/icon';
import { InlineMessage } from '../../../shared/inline-message/inline-message';
import { PlayerStateService } from '../player-state.service';
import { PROMPT_MAX_LENGTH, duplicateOf, normalizePrompt } from '../prompt-text';
import { AttemptCard } from './attempt-card';
import { Countdown } from './countdown';
import { GenerateButton } from './generate-button';
import { GenerationStatus } from './generation-status';
import { PromptEditor } from './prompt-editor';
import { TargetImage } from './target-image';

/** sessionStorage key of the city's unsent prompt, so a reload or a discarded tab keeps it. */
export function draftStorageKey(city: string): string {
  return `pb.draft.${city}`;
}

interface Draft {
  roundId: string;
  prompt: string;
}

/** Errors of the prompt itself (shown on the field), as opposed to errors of the request. */
const PROMPT_ERROR_CODES: ReadonlySet<string> = new Set(['PROMPT_BLOCKED', 'PROMPT_INVALID']);

/**
 * Round open (SPEC §10.4): target image (tap to zoom), countdown, prompt editor with counter,
 * Generate (unavailable while a generation is in flight), status line, attempts left and the attempts
 * gallery with "Submit this one".
 *
 * The prompt stays in the editor after Generate so the player can tweak it; generating the same
 * prompt again is blocked with a visible reason, because the round's fixed seed would give the same
 * image and only spend an attempt (D-024).
 */
@Component({
  selector: 'pb-round-open-screen',
  imports: [
    AttemptCard,
    Countdown,
    GenerateButton,
    GenerationStatus,
    Icon,
    InlineMessage,
    PromptEditor,
    TargetImage,
    TranslocoPipe,
  ],
  templateUrl: './round-open-screen.html',
  styleUrl: './round-open-screen.css',
})
export class RoundOpenScreen {
  private readonly state = inject(PlayerStateService);
  private readonly announcer = inject(Announcer);
  private readonly transloco = inject(TranslocoService);
  private readonly storage = sessionStore(inject(DOCUMENT));

  readonly me = input.required<Me>();
  readonly city = input.required<string>();

  protected readonly round = computed(() => this.me().round!);
  private readonly roundId = computed(() => this.round().id);
  protected readonly attempts = computed(() => this.me().attempts);
  protected readonly generation = this.state.generation;
  protected readonly serverOffset = this.state.serverOffset;
  protected readonly entryAttemptId = this.state.entryAttemptId;
  protected readonly sending = this.state.submitting;

  protected readonly noAttemptsLeft = computed(() => this.round().attemptsLeft <= 0);
  protected readonly busy = computed(() => this.sending() || this.generation() !== null);
  protected readonly latest = computed<Attempt | null>(() => this.attempts().at(-1) ?? null);

  /** The unsent prompt, restored from this round's draft (the source only changes with the round). */
  protected readonly model = linkedSignal<string, { prompt: string }>({
    source: this.roundId,
    computation: (roundId) => ({ prompt: this.readDraft(roundId) }),
  });

  protected readonly promptForm = form(this.model, (path) => {
    required(path.prompt);
    maxLength(path.prompt, PROMPT_MAX_LENGTH);
    validate(path.prompt, ({ value }) =>
      value() !== '' && normalizePrompt(value()) === '' ? { kind: 'required' } : undefined,
    );
    validate(path.prompt, ({ value }) =>
      duplicateOf(value(), this.attempts()) ? { kind: 'duplicate' } : undefined,
    );
    readonly(path.prompt, () => this.noAttemptsLeft());
  });

  /** A Generate press has been rejected by validation since the last change. */
  private readonly submitAttempted = signal(false);
  /** The last request error, with the prompt it was for (it hides once the prompt changes). */
  private readonly requestError = signal<{ error: ApiError; prompt: string } | null>(null);
  /** The last selection error, by attempt. */
  protected readonly selectError = signal<{ attemptId: string; message: ErrorMessage } | null>(
    null,
  );

  private readonly field = computed(() => this.promptForm.prompt());

  protected readonly generateReason = computed<ErrorMessage | null>(() => {
    if (this.noAttemptsLeft()) {
      return {
        key: 'player.round.generate.noAttempts',
        params: { max: this.round().attemptsPerPlayer },
      };
    }
    if (this.busy()) {
      return { key: 'player.round.generate.busy', params: {} };
    }
    return null;
  });

  /** Error shown on the field: a rejected Generate press, or the API rejecting this prompt. */
  protected readonly editorError = computed<ErrorMessage | null>(() => {
    const request = this.requestError();
    const value = this.model().prompt;
    if (request && request.prompt === value && PROMPT_ERROR_CODES.has(request.error.code)) {
      return errorMessage(request.error);
    }
    const field = this.field();
    const show = this.submitAttempted() || (field.dirty() && field.touched());
    if (!show) {
      return null;
    }
    const kinds = field.errors().map((error) => error.kind);
    if (kinds.includes('required')) {
      return { key: 'player.round.editor.required', params: {} };
    }
    if (kinds.includes('duplicate') && this.submitAttempted()) {
      return { key: 'player.round.editor.duplicate', params: {} };
    }
    return null;
  });

  /** The visible reason a repeated prompt can't be generated, before any press. */
  protected readonly editorNotice = computed<ErrorMessage | null>(() => {
    const repeated = duplicateOf(this.model().prompt, this.attempts());
    if (!repeated || this.generateReason()) {
      return null;
    }
    const number = this.attempts().indexOf(repeated) + 1;
    return { key: 'player.round.editor.duplicateOf', params: { number } };
  });

  /** A request error that isn't about the prompt (network, rate limit, round closed…). */
  protected readonly requestMessage = computed<ErrorMessage | null>(() => {
    const request = this.requestError();
    return request && !PROMPT_ERROR_CODES.has(request.error.code)
      ? errorMessage(request.error)
      : null;
  });

  constructor() {
    // Keep the draft across reloads and discarded tabs (sessionStorage, this round only).
    effect(() => this.writeDraft({ roundId: this.roundId(), prompt: this.model().prompt }));
  }

  protected async onGenerate(event: Event): Promise<void> {
    event.preventDefault();
    if (this.generateReason()) {
      // aria-disabled: the reason is already visible and linked to the button.
      return;
    }
    this.requestError.set(null);
    const valid = await submit(this.promptForm, async () => {
      const prompt = this.model().prompt;
      const error = await this.state.generate(prompt);
      if (error) {
        this.requestError.set({ error, prompt });
        this.announce(errorMessage(error));
      }
      return undefined;
    });
    this.submitAttempted.set(!valid);
    if (!valid) {
      // Its error is read with the field (aria-describedby), so no extra announcement.
      this.field().focusBoundControl();
    }
  }

  protected async onSelect(attempt: Attempt, number: number): Promise<void> {
    this.selectError.set(null);
    const error = await this.state.selectEntry(attempt.id);
    if (error) {
      const message = errorMessage(error);
      this.selectError.set({ attemptId: attempt.id, message });
      this.announce(message);
    } else {
      this.announce({ key: 'player.round.attempt.selectedAnnounce', params: { number } });
    }
  }

  protected onLastMinute(): void {
    this.announce({ key: 'player.announce.lastMinute', params: {} });
  }

  protected dismissRequestError(): void {
    this.requestError.set(null);
  }

  protected dismissSelectError(): void {
    this.selectError.set(null);
  }

  private announce(message: ErrorMessage): void {
    this.announcer.announce(this.transloco.translate(message.key, message.params));
  }

  private readDraft(roundId: string): string {
    const raw = this.storage?.get(draftStorageKey(this.city()));
    if (!raw) {
      return '';
    }
    try {
      const draft = JSON.parse(raw) as Partial<Draft>;
      return draft.roundId === roundId && typeof draft.prompt === 'string'
        ? draft.prompt.slice(0, PROMPT_MAX_LENGTH)
        : '';
    } catch {
      return '';
    }
  }

  private writeDraft(draft: Draft): void {
    this.storage?.set(draftStorageKey(this.city()), JSON.stringify(draft));
  }
}

/** sessionStorage that never throws (blocked storage just means no draft). */
function sessionStore(document: Document) {
  let storage: Storage | undefined;
  try {
    storage = document.defaultView?.sessionStorage;
  } catch {
    return null;
  }
  return {
    get(key: string): string | null {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        storage?.setItem(key, value);
      } catch {
        // Quota or blocked: the draft only lives in memory.
      }
    },
  };
}
