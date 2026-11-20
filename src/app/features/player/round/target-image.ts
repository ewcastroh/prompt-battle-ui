import { Component, computed, inject, input, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { isApiPath } from '../../../core/api/api-base-url.interceptor';
import { ApiUrlPipe } from '../../../core/api/api-url.pipe';
import { AppConfig } from '../../../core/config/app-config';
import { Icon } from '../../../shared/icon/icon';
import { ImageDialog } from '../../../shared/image-dialog/image-dialog';
import { ImageRetry } from '../../../shared/image-retry/image-retry';

/**
 * The round's target image (DESIGN.md §7): the screen's hero, tap to zoom.
 * It is the LCP image, so it loads eagerly with `fetchpriority="high"`; `srcset` lets high-density
 * phones take the 1024 px file, which the zoom dialog then reuses from cache.
 */
@Component({
  selector: 'pb-target-image',
  imports: [ApiUrlPipe, Icon, ImageDialog, ImageRetry, TranslocoPipe],
  template: `
    <button type="button" class="zoom" (click)="dialog().open()">
      <img
        class="image"
        pbImageRetry
        [src]="thumbUrl() | apiUrl"
        [attr.srcset]="srcset()"
        sizes="(min-width: 40rem) 36rem, calc(100vw - 2rem)"
        [alt]="'player.round.target.alt' | transloco: { name: roundName() }"
        width="384"
        height="384"
        fetchpriority="high"
        decoding="async"
      />
      <span class="hint">
        <pb-icon name="zoom-in" />
        {{ 'player.round.target.zoomHint' | transloco }}
      </span>
    </button>
    <pb-image-dialog
      [heading]="'player.round.target.dialogTitle' | transloco: { name: roundName() }"
      [imageUrl]="imageUrl()"
      [alt]="'player.round.target.alt' | transloco: { name: roundName() }"
    />
  `,
  styles: `
    @layer components {
      :host {
        display: block;
      }

      .zoom {
        position: relative;
        display: block;
        inline-size: 100%;
        padding: 0;
        border: var(--border-width) solid var(--color-border-strong);
        border-radius: var(--radius-md);
        background-color: var(--color-bg);
        overflow: clip;
        cursor: zoom-in;
      }

      .image {
        inline-size: 100%;
        block-size: auto;
        aspect-ratio: 1;
        object-fit: cover;
      }

      /* Visible affordance (also part of the button's name: "Label in Name"). */
      .hint {
        position: absolute;
        inset-block-end: var(--space-2);
        inset-inline-end: var(--space-2);
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-sm);
        background-color: color-mix(in oklab, black 72%, transparent);
        color: white;
        font-size: var(--text-sm);
        font-weight: 700;
      }

      @media (forced-colors: active) {
        .hint {
          border: var(--border-width) solid CanvasText;
          background-color: Canvas;
          color: CanvasText;
        }
      }
    }
  `,
})
export class TargetImage {
  readonly roundName = input.required<string>();
  /** 1024 px image path. */
  readonly imageUrl = input.required<string>();
  /** 384 px thumbnail path. */
  readonly thumbUrl = input.required<string>();

  protected readonly dialog = viewChild.required(ImageDialog);
  private readonly config = inject(AppConfig);

  protected readonly srcset = computed(() => {
    const thumb = this.resolve(this.thumbUrl());
    const full = this.resolve(this.imageUrl());
    return thumb !== full ? `${thumb} 384w, ${full} 1024w` : null;
  });

  /** Same resolution as the `apiUrl` pipe (srcset is an attribute, so it can't use the pipe). */
  private resolve(path: string): string {
    return isApiPath(path) ? this.config.apiBaseUrl + path : path;
  }
}
