import { Component, input } from '@angular/core';

/**
 * Icons copied from Lucide (https://lucide.dev), ISC License, Copyright (c) 2026 Lucide Icons and
 * Contributors; `check`, `x` and `moon` derive from Feather (MIT, Copyright (c) 2013-present Cole Bemis).
 * Full notices: THIRD_PARTY_NOTICES.md. Only the icons the app uses are included.
 */
export type IconName = 'settings' | 'sun' | 'moon' | 'check' | 'x' | 'circle-alert' | 'map-pin';

/**
 * Decorative inline SVG icon (DESIGN.md §7). Always `aria-hidden`: the control next to it carries the
 * accessible name. Inherits `currentColor` and scales with the font size (1em by default).
 */
@Component({
  selector: 'pb-icon',
  host: { 'aria-hidden': 'true' },
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      @switch (name()) {
        @case ('settings') {
          <path
            d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
          />
          <circle cx="12" cy="12" r="3" />
        }
        @case ('sun') {
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          />
        }
        @case ('moon') {
          <path
            d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
          />
        }
        @case ('check') {
          <path d="M20 6 9 17l-5-5" />
        }
        @case ('x') {
          <path d="M18 6 6 18M6 6l12 12" />
        }
        @case ('circle-alert') {
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4m0 4h.01" />
        }
        @case ('map-pin') {
          <path
            d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
          />
          <circle cx="12" cy="10" r="3" />
        }
      }
    </svg>
  `,
  styles: `
    @layer components {
      :host {
        display: inline-flex;
        flex: none;
        inline-size: var(--icon-size, 1.25em);
        block-size: var(--icon-size, 1.25em);
      }
      svg {
        inline-size: 100%;
        block-size: 100%;
      }
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
}
