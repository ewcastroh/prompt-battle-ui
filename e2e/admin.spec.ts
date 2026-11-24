import { Page, expect, test } from '@playwright/test';
import {
  FAKE_ADMIN_TOKEN,
  checkScreen,
  copyFor,
  expectFirstPartyOnly,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
  fakeAdmin,
  fill,
  trackRequests,
} from './support';

/**
 * Admin console smoke tests (SPEC §10.6, PLAN U3). Tests tagged `@desktop` run on a laptop-sized
 * desktop Chromium; the others on the phone projects (360×800, es/en × light/dark, WebKit).
 */

const LAPTOP = { width: 1366, height: 768 };

async function signIn(page: Page, path = '/admin/mde'): Promise<void> {
  await page.goto(path);
  const t = copyFor(test.info());
  await page.getByLabel(t.admin.login.label).fill(FAKE_ADMIN_TOKEN.mde);
  await page.getByRole('button', { name: t.admin.login.submit }).click();
  await expect(page.getByRole('heading', { name: t.admin.control.title })).toBeVisible();
}

function podiumStep(page: Page): Promise<number | null> {
  return fakeAdmin<{ podium: { step: number | null } | null }>(
    page,
    'mde',
    'GET',
    '/api/admin/state',
  ).then((state) => state.podium?.step ?? null);
}

test.describe('admin', () => {
  test("login is bound to the route's city @smoke", async ({ page, baseURL }, testInfo) => {
    const t = copyFor(testInfo);
    const requests = trackRequests(page);
    await page.goto('/admin/mde');
    await expect(
      page.getByRole('heading', { name: fill(t.admin.login.heading, { city: 'Medellín' }) }),
    ).toBeVisible();
    await checkScreen(page);

    // Bogotá's token on the Medellín console is refused, with a way out.
    await page.getByLabel(t.admin.login.label).fill(FAKE_ADMIN_TOKEN.bog);
    await page.getByRole('button', { name: t.admin.login.submit }).click();
    await expect(
      page.getByText(
        fill(t.admin.login.cityMismatch, { tokenCity: 'Bogotá', city: 'Medellín', code: 'bog' }),
      ),
    ).toBeVisible();
    await expect(page.getByLabel(t.admin.login.label)).toBeFocused();
    await expect(page.getByLabel(t.admin.login.label)).toHaveAttribute('aria-invalid', 'true');

    // A wrong token.
    await page.getByLabel(t.admin.login.label).fill('not-a-token-at-all-000000000');
    await page.getByRole('button', { name: t.admin.login.submit }).click();
    await expect(page.getByText(t.admin.login.invalid)).toBeVisible();

    // The right one; the console stays signed in after a reload; log out forgets it.
    await page.getByLabel(t.admin.login.label).fill(FAKE_ADMIN_TOKEN.mde);
    await page.getByRole('button', { name: t.admin.login.submit }).click();
    await expect(page.getByRole('heading', { name: t.admin.control.title })).toBeVisible();
    await checkScreen(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: t.admin.control.title })).toBeVisible();
    // Signing out on purpose lands on the cities page, and the token is gone.
    await page.getByRole('button', { name: t.admin.logout }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: t.landing.heading })).toBeVisible();
    await page.goto('/admin/mde');
    await expect(page.getByLabel(t.admin.login.label)).toBeVisible();
    expectFirstPartyOnly(requests, baseURL!);
  });

  test('links back to the cities page from the sign-in form and the console @smoke', async ({
    page,
  }, testInfo) => {
    const t = copyFor(testInfo);
    await page.goto('/admin/mde');
    await page.getByRole('link', { name: t.common.backHome }).click();
    await expect(page.getByRole('heading', { name: t.landing.heading })).toBeVisible();

    await signIn(page);
    await page
      .getByRole('navigation', { name: t.admin.nav.label })
      .getByRole('link', {
        name: t.common.backHome,
      })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: t.landing.heading })).toBeVisible();
  });

  test('section links jump within the console @smoke', async ({ page }, testInfo) => {
    const t = copyFor(testInfo);
    await signIn(page);
    const nav = page.getByRole('navigation', { name: t.admin.nav.label });
    // Panels load their data on their own; wait until none grows after the jump.
    await expect(page.getByText(t.admin.loading, { exact: true })).toHaveCount(0);
    for (const id of ['event', 'players', 'control'] as const) {
      await nav.getByRole('link', { name: t.admin.nav[id], exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/mde#admin-${id}$`));
      await expect(page.locator(`#admin-${id}`)).toBeInViewport();
      await expect(page.locator(`#admin-${id}`)).toBeFocused();
    }
    // Still the console (not the landing page), still signed in.
    await expect(page.getByRole('heading', { name: t.admin.control.title })).toBeVisible();
  });

  test('runs a round: start, +60 s, close with confirmation @smoke', async ({ page }, testInfo) => {
    const t = copyFor(testInfo);
    await signIn(page);
    await page
      .getByRole('button', {
        name: fill(t.admin.control.start, { name: 'Práctica: gato dormido' }),
      })
      .click();
    await expect(page.locator('pb-admin-control .summary')).toContainText(t.admin.phase.ROUND_OPEN);
    await expect(page.locator('pb-admin-control [role="timer"]')).toHaveText(/^\s*[23]:\d\d\s*$/);
    await page.getByRole('button', { name: t.admin.control.extend }).click();
    await expect(page.locator('pb-admin-control [role="timer"]')).toHaveText(/^\s*[34]:\d\d\s*$/);
    await checkScreen(page);

    await page.getByRole('button', { name: t.admin.control.close }).click();
    const dialog = page.getByRole('dialog', { name: t.admin.control.closeTitle });
    await expect(dialog).toBeVisible();
    // The safe action has focus first.
    await expect(dialog.getByRole('button', { name: t.admin.confirm.cancel })).toBeFocused();
    await checkScreen(page);
    await dialog.getByRole('button', { name: t.admin.control.close }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('pb-admin-control .summary')).not.toContainText(
      t.admin.phase.ROUND_OPEN,
    );
  });

  test('each Next reveals exactly one step, even when double-tapped @smoke @desktop', async ({
    page,
  }, testInfo) => {
    const t = copyFor(testInfo);
    await page.setViewportSize(LAPTOP);
    await signIn(page, '/admin/mde?scene=podium-0');
    const next = page.getByRole('button', { name: new RegExp(t.admin.control.next) });
    await expect(next).toContainText(fill(t.admin.control.revealRank, { rank: 5 }));

    await next.click();
    await expect(next).toContainText(fill(t.admin.control.revealRank, { rank: 4 }));
    expect(await podiumStep(page)).toBe(1);

    await next.dblclick();
    await expect(next).toContainText(fill(t.admin.control.revealRank, { rank: 3 }));
    expect(await podiumStep(page)).toBe(2);
    await expectNoHorizontalScroll(page);
    await expectNoAxeViolations(page);
  });

  test('hides an entry before the podium reveal @smoke @desktop', async ({ page }, testInfo) => {
    const t = copyFor(testInfo);
    await page.setViewportSize(LAPTOP);
    await signIn(page, '/admin/mde?scene=scored');
    const preview = page.getByRole('region', { name: t.admin.control.previewPodium });
    const first = preview.locator('tbody th').first();
    const nickname = (await first.textContent())!.trim();
    await preview.getByRole('button', { name: `${t.admin.entries.hide} ${nickname}` }).click();
    await expect(preview).not.toContainText(nickname);
  });

  test('downloads the results CSV @smoke @desktop', async ({ page }, testInfo) => {
    const t = copyFor(testInfo);
    await page.setViewportSize(LAPTOP);
    await signIn(page, '/admin/mde?scene=finished');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: t.admin.event.csv }).click();
    expect((await download).suggestedFilename()).toBe('results-mde.csv');
  });

  test('the event reset needs RESET typed exactly @smoke', async ({ page }, testInfo) => {
    const t = copyFor(testInfo);
    await signIn(page);
    await page.getByRole('button', { name: t.admin.event.reset }).click();
    const dialog = page.getByRole('dialog', { name: t.admin.event.resetTitle });
    await expect(dialog).toBeVisible();
    const field = dialog.getByLabel(fill(t.admin.confirm.typeLabel, { text: 'RESET' }));
    await expect(field).toBeFocused();
    await checkScreen(page);

    await field.press('Enter');
    await expect(
      dialog.getByText(fill(t.admin.confirm.typeMismatch, { text: 'RESET' })),
    ).toBeVisible();
    await field.fill('reset');
    await field.press('Enter');
    // Nothing was reset: the rounds are still there.
    const rounds = await fakeAdmin<unknown[]>(page, 'mde', 'GET', '/api/admin/rounds');
    expect(rounds.length).toBeGreaterThan(0);

    await field.fill('RESET');
    await dialog.getByRole('button', { name: t.admin.event.reset }).click();
    await expect(page.getByText(t.admin.login.reason.RESET)).toBeVisible();
  });
});
