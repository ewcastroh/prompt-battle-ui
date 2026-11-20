import { expect, test } from '@playwright/test';
import en from '../public/i18n/en.json';
import es from '../public/i18n/es.json';
import {
  checkScreen,
  closeRound,
  copyFor,
  expectFirstPartyOnly,
  fill,
  screenHeading,
  setOffline,
  startRound,
  trackRequests,
} from './support';

/**
 * Player smoke test (SPEC §14.2-3, PLAN U2) against the in-browser fake API, at 360×800, in both
 * languages and both themes: join → generate → submit → round closed, with no horizontal scroll,
 * no requests to third-party origins, tap targets ≥ 44 px and no AXE violations on each screen.
 */
test.describe('player', () => {
  test('join → generate → submit → round closed @smoke', async ({ page, baseURL }, testInfo) => {
    const t = copyFor(testInfo);
    const requests = trackRequests(page);

    await page.goto('/play/mde');
    await expect(screenHeading(page)).toHaveText(t.app.eventTitle);
    await expect(page.locator('html')).toHaveAttribute(
      'lang',
      testInfo.project.name.includes('-en-') ? 'en' : 'es-CO',
    );
    await checkScreen(page);

    // Join
    await page.getByLabel(t.player.join.nicknameLabel).fill('Ana_dev');
    await page.getByRole('button', { name: t.player.join.submit }).click();
    await expect(screenHeading(page)).toHaveText(
      fill(t.player.title.lobby, { nickname: 'Ana_dev' }),
    );
    await expect(page.getByText(t.player.lobby.wait)).toBeVisible();
    await checkScreen(page);

    // The admin starts the first scored round ("Café al amanecer" in the fake).
    await startRound(page, 'mde');
    await expect(screenHeading(page)).toHaveText('Café al amanecer');
    await expect(page.getByRole('timer')).toBeVisible();
    await checkScreen(page);

    // Generate
    const editor = page.getByLabel(t.player.round.editor.label);
    await editor.fill('una taza de café humeante al amanecer en Antioquia [sim=0.9]');
    await page.getByRole('button', { name: t.player.round.generate.label, exact: true }).click();
    const submit = page.getByRole('button', {
      name: new RegExp(`^${t.player.round.attempt.submit}`),
    });
    await expect(submit).toBeVisible({ timeout: 15_000 });
    // The prompt stays for tweaking; repeating it exactly is blocked with a visible reason (D-024).
    await expect(editor).toHaveValue(/una taza de café/);
    await expect(
      page.getByText(fill(t.player.round.editor.duplicateOf, { number: 1 })),
    ).toBeVisible();
    await checkScreen(page);

    // Submit this one
    await submit.click();
    await expect(
      page.getByRole('button', { name: new RegExp(`^${t.player.round.attempt.selected}`) }),
    ).toBeVisible();

    // The admin closes the round.
    await closeRound(page, 'mde');
    await expect(screenHeading(page)).toHaveText(t.player.title.roundClosed);
    await expect(page.getByText(t.player.closed.scoring)).toBeVisible();
    await expect(page.getByText(t.player.closed.entryHeading)).toBeVisible();
    await checkScreen(page);

    expectFirstPartyOnly(requests, baseURL!);
  });

  test('switching language updates the title and heading at once, without a reload @smoke', async ({
    page,
  }, testInfo) => {
    const startsEnglish = testInfo.project.name.includes('-en-');
    const [from, to] = startsEnglish ? [en, es] : [es, en];
    await page.goto('/play/mde');
    await expect(screenHeading(page)).toHaveText(from.app.eventTitle);

    await page.getByRole('button', { name: from.settings.open }).click();
    await page
      .getByRole('radio', {
        name: startsEnglish ? from.settings.languageName.es : from.settings.languageName.en,
      })
      .check();
    // The other language's file loads only now: the heading must not show raw keys meanwhile.
    await expect(screenHeading(page)).toHaveText(to.app.eventTitle);
    await expect(page).toHaveTitle(`${to.player.docTitle.join} | ${to.app.name}`);
    await expect(page.locator('html')).toHaveAttribute('lang', startsEnglish ? 'es-CO' : 'en');
    await expect(page.getByText(to.player.join.privacy)).toBeVisible();
  });

  test('a lost connection shows a retry banner, and it clears once back @smoke', async ({
    page,
  }, testInfo) => {
    const t = copyFor(testInfo);
    await page.goto('/play/mde');
    await page.getByLabel(t.player.join.nicknameLabel).fill('Wifi_Venue');
    await page.getByRole('button', { name: t.player.join.submit }).click();
    await expect(page.getByText(t.player.lobby.wait)).toBeVisible();

    await setOffline(page, true);
    // Two failed polls (1.5 s, then 3 s backoff) before the banner shows.
    const banner = page.getByRole('main').getByText(t.player.connection.lost);
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await checkScreen(page);

    await setOffline(page, false);
    await page.getByRole('button', { name: t.player.connection.retry }).click();
    await expect(banner).toBeHidden();
    await expect(page.getByText(t.player.lobby.wait)).toBeVisible();
  });

  test('reduced motion slows the scoring spinner instead of spinning fast @smoke', async ({
    page,
  }, testInfo) => {
    const t = copyFor(testInfo);
    const spinner = page.locator('pb-round-closed-screen progress.loading-spinner');
    const duration = () =>
      spinner.evaluate((element) => getComputedStyle(element).animationDuration);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/play/mde?fixture=round-closed');
    // Wait for the round-closed screen (the loading screen has a spinner too).
    await expect(screenHeading(page)).toHaveText(t.player.title.roundClosed);
    await expect(spinner).toBeVisible();
    expect(await duration()).toBe('1.5s');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await duration()).toBe('6s');
  });
});
