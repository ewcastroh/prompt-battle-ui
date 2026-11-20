import AxeBuilder from '@axe-core/playwright';
import { Page, TestInfo, expect } from '@playwright/test';
import en from '../public/i18n/en.json';
import es from '../public/i18n/es.json';

export type Copy = typeof es;

/** The translation file of the project's language (the `lang` the test seeded). */
export function copyFor(testInfo: TestInfo): Copy {
  return testInfo.project.name.includes('-en-') ? (en as Copy) : es;
}

/** Fills `{{name}}` params like Transloco. */
export function fill(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(params[name] ?? ''));
}

/** Records every request URL the page makes, to prove nothing goes to a third-party origin. */
export function trackRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

export function expectFirstPartyOnly(urls: readonly string[], baseURL: string): void {
  const origin = new URL(baseURL).origin;
  const thirdParty = urls.filter(
    (url) => !url.startsWith('data:') && new URL(url).origin !== origin,
  );
  expect(thirdParty, 'requests to other origins').toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(overflow.scroll, 'page wider than the viewport').toBeLessThanOrEqual(overflow.client);
}

/** Every visible control is at least 44×44 CSS px (DESIGN.md §5). */
export async function expectTapTargets(page: Page): Promise<void> {
  const small = await page.evaluate(() => {
    const selector = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'textarea',
      'select',
      'summary',
      '[role="button"]',
    ].join(',');
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0 &&
          !element.closest('[popover]:not(:popover-open), dialog:not([open])')
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element: `${element.tagName.toLowerCase()}.${element.className}`,
          text: (element.textContent ?? '').trim().slice(0, 40),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((target) => target.width < 44 || target.height < 44);
  });
  expect(small, 'tap targets under 44 px').toEqual([]);
}

/** AXE, WCAG 2.2 A/AA rules (the UI's CLAUDE.md: "MUST pass all AXE checks"). */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5),
  }));
  expect(violations, 'AXE violations').toEqual([]);
}

/** The checks every player screen must pass. */
export async function checkScreen(page: Page): Promise<void> {
  await expectNoHorizontalScroll(page);
  await expectTapTargets(page);
  await expectNoAxeViolations(page);
}

// ------------------------------------------------------------------ fake backend hook

interface FakeHook {
  startRound(city: string, options?: { scored?: boolean }): string;
  closeRound(city: string): void;
  setOffline(offline: boolean): void;
}

declare global {
  interface Window {
    __pbFake: FakeHook;
  }
}

export function startRound(page: Page, city: string, scored = true): Promise<string> {
  return page.evaluate(([c, s]) => window.__pbFake.startRound(c, { scored: s }), [
    city,
    scored,
  ] as const);
}

export function closeRound(page: Page, city: string): Promise<void> {
  return page.evaluate((c) => window.__pbFake.closeRound(c), city);
}

export function setOffline(page: Page, offline: boolean): Promise<void> {
  return page.evaluate((value) => window.__pbFake.setOffline(value), offline);
}

/** The page's `<h1>` (the header title of the current screen). */
export function screenHeading(page: Page) {
  return page.locator('#player-title');
}
