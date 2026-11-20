import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiUrlPipe } from '../../core/api/api-url.pipe';
import { Announcer } from '../../core/ui/announcer';
import { ImageRetry } from '../image-retry/image-retry';

let nextId = 0;

/**
 * Full-size image viewer (DESIGN.md §7 "Target image"; modern-web-guidance `dialog`,
 * `light-dismiss-a-dialog`, `prevent-page-scroll-under-modal-dialog`).
 *
 * A native modal `<dialog>` opened with `showModal()`: the browser makes the page inert, handles Esc
 * and the Android back gesture, and returns focus to the button that opened it. `closedby="any"`
 * adds tap-outside dismissal; Safari lacks it, so a pointer fallback closes the dialog when a press
 * starts and ends outside its box. The close button lives in a `<form method="dialog">`.
 *
 * The image renders only while the dialog is open, so the 1024 px file is downloaded on demand.
 */
@Component({
  selector: 'pb-image-dialog',
  imports: [ApiUrlPipe, ImageRetry, TranslocoPipe],
  template: `
    <dialog
      #dialog
      class="viewer"
      closedby="any"
      [attr.aria-labelledby]="titleId"
      (pointerdown)="onPointerDown($event)"
      (pointerup)="onPointerUp($event)"
      (close)="onClose()"
    >
      <div class="head">
        <h1 class="title" [id]="titleId">{{ heading() }}</h1>
        <form method="dialog">
          <button type="submit" class="close" autofocus>
            {{ 'imageDialog.close' | transloco }}
          </button>
        </form>
      </div>
      @if (isOpen()) {
        <img
          class="image"
          pbImageRetry
          [src]="imageUrl() | apiUrl"
          [alt]="alt()"
          width="1024"
          height="1024"
          fetchpriority="low"
          decoding="async"
        />
      }
      @if (caption(); as text) {
        <p class="caption">
          <span class="caption-label">{{ captionLabel() }}</span>
          <span class="caption-text">{{ text }}</span>
        </p>
      }
    </dialog>
  `,
  styles: `
    @layer components {
      .viewer {
        inline-size: min(100% - 2 * var(--space-4), 40rem);
        max-inline-size: none;
        max-block-size: calc(100dvh - 2 * var(--space-4));
        padding: var(--space-4);
        border: var(--border-width) solid var(--color-border-strong);
        border-radius: var(--radius-md);
        background-color: var(--color-surface-raised);
        color: var(--color-text);
        box-shadow: var(--shadow-raised);
      }

      /* Layout only while open: display on a closed dialog would show it. */
      .viewer[open] {
        display: grid;
        gap: var(--space-3);
      }

      /* Scrolling over the dialog or its backdrop must not scroll the gallery behind it. */
      .viewer:modal {
        overscroll-behavior: contain;
      }

      .viewer::backdrop {
        overflow: hidden;
        overscroll-behavior: contain;
        background-color: color-mix(in oklab, black 62%, transparent);
      }

      .head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2) var(--space-3);
      }

      .title {
        flex: 1 1 12rem;
        min-inline-size: 0;
        margin: 0;
        font-size: var(--text-lg);
      }

      .close {
        min-block-size: var(--tap-target);
        min-inline-size: var(--tap-target);
        padding-inline: var(--space-4);
        border: var(--border-width) solid var(--color-border-strong);
        border-radius: var(--radius-md);
        background-color: var(--color-surface);
        font-weight: 700;
      }

      @media (hover: hover) and (pointer: fine) {
        .close:hover {
          background-color: var(--color-bg);
        }
      }

      .image {
        inline-size: 100%;
        max-block-size: calc(100dvh - 14rem);
        aspect-ratio: 1;
        object-fit: contain;
        border-radius: var(--radius-sm);
        background-color: var(--color-bg);
      }

      .caption {
        display: grid;
        gap: var(--space-1);
        max-inline-size: none;
        margin: 0;
      }

      .caption-label {
        font-family: var(--font-mono);
        font-size-adjust: from-font;
        font-size: var(--text-sm);
        color: var(--syntax-comment);
      }

      .caption-text {
        overflow-wrap: anywhere;
      }
    }
  `,
})
export class ImageDialog {
  private readonly announcer = inject(Announcer);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nativeLightDismiss = 'closedBy' in HTMLDialogElement.prototype;
  private pressedOutside = false;

  readonly heading = input.required<string>();
  readonly imageUrl = input<string | null>(null);
  readonly alt = input('');
  /** Text shown under the image (an attempt's prompt), with `captionLabel` above it. */
  readonly caption = input<string | null>(null);
  readonly captionLabel = input('');
  readonly closed = output<void>();

  protected readonly titleId = `pb-image-dialog-${nextId++}`;
  protected readonly isOpen = signal(false);

  constructor() {
    // Removing an open dialog (the screen changed under it) fires no `close` event.
    inject(DestroyRef).onDestroy(() => {
      if (this.isOpen()) {
        this.isOpen.set(false);
        this.announcer.modalClosed();
      }
    });
  }

  /** Opens the dialog modally. Call it from the click handler of the button that should get focus back. */
  open(): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) {
      return;
    }
    this.isOpen.set(true);
    this.announcer.modalOpened();
    dialog.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected onClose(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.announcer.modalClosed();
    this.closed.emit();
  }

  // Light-dismiss fallback where `closedby` is unsupported (Safari): both the press and the release
  // must be outside the dialog's box, so a drag that ends on the backdrop doesn't close it.
  protected onPointerDown(event: PointerEvent): void {
    if (!this.nativeLightDismiss) {
      this.pressedOutside = this.isOutside(event);
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.nativeLightDismiss && this.pressedOutside && this.isOutside(event)) {
      this.close();
    }
    this.pressedOutside = false;
  }

  private isOutside(event: PointerEvent): boolean {
    const rect = this.dialog().nativeElement.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  }
}
