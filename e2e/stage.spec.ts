import { Page, expect, test } from '@playwright/test';
import {
  Copy,
  STAGE_SIZES,
  copyFor,
  expectFirstPartyOnly,
  expectFitsScreen,
  expectNoAxeViolations,
  fakeAdmin,
  fill,
  trackRequests,
} from './support';

/**
 * Stage smoke tests (SPEC §10.5, PLAN U3) on desktop Chromium, in es/light and en/dark. The fake
 * API lives in the page, so admin actions go through `window.__pbFake` on the stage page itself;
 * `?scene=` plays the fake event up to a phase before the app starts.
 */

interface PodiumState {
  podium: { size: number; step: number | null } | null;
  miniPodium: { size: number; step: number } | null;
}

async function checkStage(page: Page): Promise<void> {
  for (const size of STAGE_SIZES) {
    await page.setViewportSize(size);
    await expectFitsScreen(page);
  }
  await page.setViewportSize(STAGE_SIZES[0]);
  await expectNoAxeViolations(page);
}

/** The rank shown by the current podium step (`#3`), from the head of the reveal scene. */
function shownRank(page: Page) {
  return page.locator('pb-stage-reveal .rank');
}

test.describe('stage', () => {
  test('the settings popover leads back to the cities page; nothing extra on the projector @smoke @desktop', async ({
    page,
  }, testInfo) => {
    const t = copyFor(testInfo);
    await page.goto('/stage/mde?scene=lobby');
    await expect(page.getByRole('heading', { level: 2, name: t.stage.lobby.title })).toBeVisible();
    // Closed popover: no visible link on the stage.
    await expect(page.getByRole('link', { name: t.common.backHome })).toBeHidden();

    await page.getByRole('button', { name: t.settings.open }).click();
    await expect(page.getByRole('link', { name: t.common.backHome })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('link', { name: t.common.backHome }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: t.landing.heading })).toBeVisible();
  });

  test('lobby: city, QR, short URL, counter and nicknames @smoke @desktop', async ({
    page,
    baseURL,
  }, testInfo) => {
    const t = copyFor(testInfo);
    const requests = trackRequests(page);
    await page.goto('/stage/mde?scene=lobby');
    await expect(page.getByRole('heading', { level: 2, name: t.stage.lobby.title })).toBeVisible();
    await expect(
      page.getByRole('img', { name: fill(t.stage.lobby.qrAlt, { city: 'Medellín' }) }),
    ).toBeVisible();
    await expect(page.getByText('localhost:4200/play/mde')).toBeVisible();
    await expect(page.locator('pb-stage-lobby .stage-hero')).toHaveText('8');
    await expect(page.getByRole('list', { name: t.stage.lobby.namesLabel })).toContainText(
      'Pixel_Paisa',
    );
    await checkStage(page);
    expectFirstPartyOnly(requests, baseURL!);
  });

  test('round open: the target and a countdown, never a player image @smoke @desktop', async ({
    page,
  }, testInfo) => {
    const t = copyFor(testInfo);
    // Every player has generated an image already: none may reach the stage while the round is open.
    await page.goto('/stage/mde?scene=round-open');
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(1);
    await expect(page.locator('main img')).toHaveAttribute(
      'alt',
      fill(t.stage.round.targetAlt, { name: 'Café al amanecer' }),
    );
    await expect(
      page.getByText(fill(t.stage.round.submissions, { count: 6, total: 8 })),
    ).toBeVisible();
    await checkStage(page);
  });

  test('the podium reveals exactly one entry per admin Next, then the hidden prompts @smoke @desktop', async ({
    page,
  }, testInfo) => {
    const t = copyFor(testInfo);
    await page.goto('/stage/mde?scene=podium-0');
    const state = await fakeAdmin<PodiumState>(page, 'mde', 'GET', '/api/admin/state');
    const size = state.podium!.size;
    expect(size).toBe(5);

    // Intro: the places, no names, no images.
    await expect(
      page.getByRole('heading', { name: fill(t.stage.reveal.podiumTitle, { size }) }),
    ).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
    await checkStage(page);

    const seen: string[] = [];
    for (let step = 1; step <= size; step++) {
      await fakeAdmin(page, 'mde', 'POST', '/api/admin/podium/next');
      const rank = size - step + 1;
      await expect(shownRank(page)).toHaveText(`#${rank}`);
      // One entry on screen: its picture beside the target, its nickname.
      await expect(page.locator('main img')).toHaveCount(2);
      const nickname = (await page.locator('pb-stage-reveal .nick').textContent())!.trim();
      expect(seen).not.toContain(nickname);
      seen.push(nickname);
      await expect(page.locator('pb-stage-reveal .prompt')).toContainText(t.stage.reveal.prompt);
      await checkStage(page);
    }
    // #1 gets the static celebration (and confetti where motion is allowed).
    await expect(page.locator('pb-stage-reveal')).toHaveClass(/winner/);
    expect(seen).toHaveLength(size);

    // One more Next: the final list and each round's original prompt.
    await fakeAdmin(page, 'mde', 'POST', '/api/admin/podium/next');
    await expect(page.getByRole('heading', { name: t.stage.finished.prompts })).toBeVisible();
    await expect(page.locator('pb-stage-finished .row')).toHaveCount(size);
    await expect(
      page.getByText('a steaming cup of coffee at dawn', { exact: false }),
    ).toBeVisible();
    await checkStage(page);
  });

  test('a mini-podium step at a time, with commentary in the stage language @smoke @desktop', async ({
    page,
  }, testInfo) => {
    const t: Copy = copyFor(testInfo);
    await page.goto('/stage/mde?scene=mini-0');
    await expect(
      page.getByRole('heading', { name: fill(t.stage.reveal.miniTitle, { size: 3 }) }),
    ).toBeVisible();
    await fakeAdmin(page, 'mde', 'POST', '/api/admin/mini-podium/next');
    await expect(shownRank(page)).toHaveText('#3');
    const comment = page.locator('pb-stage-reveal .comment');
    const english = testInfo.project.name.includes('-en-');
    await expect(comment).toHaveText(english ? /style|target/ : /estilo|objetivo/);
    await checkStage(page);
  });

  test('closing and scoring show the waiting message @smoke @desktop', async ({
    page,
  }, testInfo) => {
    const t = copyFor(testInfo);
    await page.goto('/stage/mde?scene=closing');
    await expect(page.getByRole('heading', { name: t.stage.wait.scoring })).toBeVisible();
    await expect(page.locator('main img')).toHaveCount(0);
    await checkStage(page);
  });
});
