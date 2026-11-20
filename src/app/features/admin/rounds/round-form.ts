import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormField,
  form,
  max,
  maxLength,
  min,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApiError } from '../../../core/api/api-error';
import { ApiUrlPipe } from '../../../core/api/api-url.pipe';
import { RoundDefinition, RoundInput, TargetPreview } from '../../../core/api/api.models';
import { ErrorMessage, errorMessage } from '../../../core/api/error-messages';
import { Announcer } from '../../../core/ui/announcer';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';
import { AdminApi } from '../admin-api';

/** API.md §7 round limits. */
export const ROUND_LIMITS = {
  name: 60,
  hiddenPrompt: 1000,
  durationMin: 60,
  durationMax: 1800,
  attemptsMin: 1,
  attemptsMax: 10,
  seedMax: 2147483647,
  uploadMb: 10,
} as const;

const UPLOAD_TYPES = ['image/jpeg', 'image/png'];

export type TargetSource = 'generate' | 'upload' | 'keep';

/** Checks an upload before sending it (D-022 #1: JPEG or PNG, ≤ 10 MB); the error key or `null`. */
export function uploadProblem(file: File | null): string | null {
  if (!file) {
    return 'admin.roundForm.uploadMissing';
  }
  if (!UPLOAD_TYPES.includes(file.type)) {
    return 'admin.roundForm.uploadType';
  }
  return file.size > ROUND_LIMITS.uploadMb * 1024 * 1024 ? 'admin.roundForm.uploadSize' : null;
}

/** `''` → `null`; digits → the number. */
export function parseSeed(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : Number(trimmed);
}

interface FormModel {
  name: string;
  scored: boolean;
  hiddenPrompt: string;
  durationSec: number;
  attemptsPerPlayer: number;
  seed: string;
  source: TargetSource;
}

const EMPTY: FormModel = {
  name: '',
  scored: true,
  hiddenPrompt: '',
  durationSec: 480,
  attemptsPerPlayer: 3,
  seed: '',
  source: 'generate',
};

/**
 * Round builder (SPEC §10.6, API.md §7), in a modal dialog: name, scored or practice, the hidden
 * reference prompt, duration, attempts, an optional seed, and the target, either generated from
 * the hidden prompt (a preview the admin sees before saving) or uploaded (JPEG/PNG ≤ 10 MB). When
 * editing, the current target can be kept. With unsaved changes, Esc doesn't throw them away: the
 * dialog asks first.
 */
@Component({
  selector: 'pb-round-form',
  imports: [ApiUrlPipe, FormField, Icon, Spinner, TranslocoPipe],
  templateUrl: './round-form.html',
  styleUrl: './round-form.css',
})
export class RoundForm {
  private readonly api = inject(AdminApi);
  private readonly announcer = inject(Announcer);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly saved = output<RoundDefinition>();

  protected readonly limits = ROUND_LIMITS;
  protected readonly editing = signal<RoundDefinition | null>(null);
  protected readonly model = signal<FormModel>({ ...EMPTY });
  protected readonly roundForm = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, ROUND_LIMITS.name);
    required(path.hiddenPrompt);
    maxLength(path.hiddenPrompt, ROUND_LIMITS.hiddenPrompt);
    min(path.durationSec, ROUND_LIMITS.durationMin);
    max(path.durationSec, ROUND_LIMITS.durationMax);
    min(path.attemptsPerPlayer, ROUND_LIMITS.attemptsMin);
    max(path.attemptsPerPlayer, ROUND_LIMITS.attemptsMax);
    validate(path.seed, ({ value }) => {
      const seed = value().trim();
      return seed === '' || (/^\d+$/.test(seed) && Number(seed) <= ROUND_LIMITS.seedMax)
        ? undefined
        : { kind: 'seed' };
    });
  });

  protected readonly preview = signal<TargetPreview | null>(null);
  protected readonly file = signal<File | null>(null);
  protected readonly generating = signal(false);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly targetError = signal<string | null>(null);
  protected readonly requestError = signal<ErrorMessage | null>(null);
  protected readonly confirmDiscard = signal(false);
  private isOpen = false;

  protected readonly titleKey = computed(() =>
    this.editing() ? 'admin.roundForm.editTitle' : 'admin.roundForm.newTitle',
  );
  protected readonly fieldErrors = computed(() => {
    const show = this.submitted();
    const f = this.roundForm;
    const has = (field: () => { invalid(): boolean; touched(): boolean }) =>
      (show || field().touched()) && field().invalid();
    return {
      name: has(f.name),
      hiddenPrompt: has(f.hiddenPrompt),
      durationSec: has(f.durationSec),
      attemptsPerPlayer: has(f.attemptsPerPlayer),
      seed: has(f.seed),
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.isOpen) {
        this.announcer.modalClosed();
      }
    });
  }

  openNew(): void {
    this.editing.set(null);
    this.reset({ ...EMPTY });
  }

  openEdit(round: RoundDefinition): void {
    this.editing.set(round);
    this.reset({
      name: round.name,
      scored: round.scored,
      hiddenPrompt: round.hiddenPrompt,
      durationSec: round.durationSec,
      attemptsPerPlayer: round.attemptsPerPlayer,
      seed: String(round.seed),
      source: 'keep',
    });
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected onClose(): void {
    if (this.isOpen) {
      this.isOpen = false;
      this.announcer.modalClosed();
    }
  }

  /** Esc with unsaved changes: keep the dialog open and ask (modern-web-guidance `dialog`). */
  protected onCancel(event: Event): void {
    if (this.roundForm().dirty() && !this.confirmDiscard()) {
      event.preventDefault();
      this.confirmDiscard.set(true);
    }
  }

  protected setSource(source: TargetSource): void {
    this.model.update((m) => ({ ...m, source }));
    this.targetError.set(null);
  }

  protected setScored(scored: boolean): void {
    this.model.update((m) => ({
      ...m,
      scored,
      // Practice defaults to 3 minutes (API.md §7) unless the admin already changed it.
      durationSec: m.durationSec === (scored ? 180 : 480) ? (scored ? 480 : 180) : m.durationSec,
    }));
  }

  protected onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(file);
    this.targetError.set(file ? uploadProblem(file) : null);
  }

  protected async generate(): Promise<void> {
    if (this.generating()) {
      return;
    }
    const prompt = this.model().hiddenPrompt.trim();
    if (!prompt) {
      this.roundForm.hiddenPrompt().markAsTouched();
      this.targetError.set('admin.roundForm.promptFirst');
      return;
    }
    if (this.roundForm.seed().invalid()) {
      return;
    }
    this.generating.set(true);
    this.targetError.set(null);
    this.requestError.set(null);
    try {
      this.preview.set(await this.api.generateTarget(prompt, parseSeed(this.model().seed)));
      this.announcer.announce(this.label('admin.roundForm.previewReady'));
    } catch (error) {
      this.requestError.set(errorMessage(error));
    } finally {
      this.generating.set(false);
    }
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) {
      return;
    }
    this.submitted.set(true);
    this.requestError.set(null);
    const m = this.model();
    const targetProblem =
      m.source === 'generate'
        ? this.preview()
          ? null
          : 'admin.roundForm.previewMissing'
        : m.source === 'upload'
          ? uploadProblem(this.file())
          : null;
    this.targetError.set(targetProblem);
    await submit(this.roundForm, async () => {
      if (targetProblem) {
        return undefined;
      }
      this.saving.set(true);
      const input: RoundInput = {
        name: m.name.trim(),
        hiddenPrompt: m.hiddenPrompt.trim(),
        durationSec: m.durationSec,
        attemptsPerPlayer: m.attemptsPerPlayer,
        scored: m.scored,
        seed: parseSeed(m.seed),
      };
      if (m.source === 'generate') {
        input.previewId = this.preview()!.previewId;
      }
      try {
        const round = await this.api.saveRound(
          this.editing()?.id ?? null,
          input,
          m.source === 'upload' ? this.file() : null,
        );
        this.saved.emit(round);
        this.announcer.announce(this.label('admin.roundForm.saved'));
        this.roundForm().reset();
        this.close();
      } catch (error) {
        this.requestError.set(errorMessage(error instanceof ApiError ? error : null));
      } finally {
        this.saving.set(false);
      }
      return undefined;
    });
    if (this.roundForm().invalid() || targetProblem) {
      this.dialog()
        .nativeElement.querySelector<HTMLElement>('[aria-invalid="true"], .target-error')
        ?.focus();
    }
  }

  private reset(model: FormModel): void {
    this.model.set(model);
    this.roundForm().reset();
    this.preview.set(null);
    this.file.set(null);
    this.submitted.set(false);
    this.targetError.set(null);
    this.requestError.set(null);
    this.confirmDiscard.set(false);
    const dialog = this.dialog().nativeElement;
    const fileInput = dialog.querySelector<HTMLInputElement>('input[type="file"]');
    if (fileInput) {
      fileInput.value = '';
    }
    if (!dialog.open) {
      this.isOpen = true;
      this.announcer.modalOpened();
      dialog.showModal();
    }
  }

  private label(key: string): string {
    return this.transloco.translate(key);
  }
}
