import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiUrlPipe } from '../../../core/api/api-url.pipe';
import { PracticeGalleryItem } from '../../../core/api/api.models';

/**
 * Practice gallery (D-020 #6): up to six non-hidden practice entries, shown in the lobby only while
 * the admin toggles it on. These are the only player images the stage shows outside the reveals.
 */
@Component({
  selector: 'pb-stage-gallery',
  imports: [ApiUrlPipe, TranslocoPipe],
  template: `
    <h2 class="stage-title">{{ 'stage.gallery.title' | transloco }}</h2>
    <ul class="grid">
      @for (item of items(); track $index) {
        <li class="stage-fit fit-watch">
          <figure class="stage-square caption-below">
            <img
              [src]="item.imageUrl | apiUrl"
              [alt]="'stage.gallery.alt' | transloco: { nickname: item.nickname }"
              width="1024"
              height="1024"
              decoding="async"
            />
            <figcaption class="stage-text fit-text nick">{{ item.nickname }}</figcaption>
          </figure>
        </li>
      }
    </ul>
  `,
  styles: `
    @layer components {
      :host {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        gap: var(--space-6);
        min-block-size: 0;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-auto-rows: minmax(0, 1fr);
        gap: var(--space-6);
        min-block-size: 0;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .nick {
        font-weight: 700;
      }
    }
  `,
})
export class StageGallery {
  readonly items = input.required<readonly PracticeGalleryItem[]>();
}
