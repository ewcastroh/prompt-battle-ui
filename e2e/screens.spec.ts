import { expect, test } from '@playwright/test';
import { FIXTURE_DATA, FIXTURE_SCREENS } from '../src/app/fake-backend/fake-fixtures';
import { checkScreen, copyFor, expectNoHorizontalScroll, screenHeading } from './support';

/**
 * Every player screen with the demo and the worst-case fixture (break-ui), screenshotted for review
 * into e2e/screenshots/<project>/ (git-ignored), and checked at 360 and 320 px wide.
 * Run with `npm run e2e:screens`.
 */
test.describe('player screens', () => {
  for (const screen of FIXTURE_SCREENS) {
    for (const data of FIXTURE_DATA) {
      test(`${screen} (${data}) @screens`, async ({ page }, testInfo) => {
        const t = copyFor(testInfo);
        await page.goto(`/play/mde?fixture=${screen}&data=${data}`);
        await expect(screenHeading(page)).not.toHaveText(t.player.title.loading);
        await expect(screenHeading(page)).not.toHaveText('');
        // Let the screen settle (the cross-fade, if any) before the checks.
        await page.waitForTimeout(400);

        await checkScreen(page);
        await page.screenshot({
          path: `e2e/screenshots/${testInfo.project.name}/${screen}--${data}.png`,
          fullPage: true,
          animations: 'disabled',
        });

        // WCAG 1.4.10 reflow: still no horizontal scroll at 320 CSS px.
        await page.setViewportSize({ width: 320, height: 800 });
        await expectNoHorizontalScroll(page);
        await page.setViewportSize({ width: 360, height: 800 });
      });
    }
  }

  test('target zoom dialog @screens', async ({ page }, testInfo) => {
    const t = copyFor(testInfo);
    await page.goto('/play/mde?fixture=round-open&data=worst');
    await page.getByRole('button', { name: new RegExp(t.player.round.target.zoomHint) }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: t.imageDialog.close })).toBeFocused();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `e2e/screenshots/${testInfo.project.name}/zoom-target--worst.png`,
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // Focus returns to the button that opened it.
    await expect(
      page.getByRole('button', { name: new RegExp(t.player.round.target.zoomHint) }),
    ).toBeFocused();
  });

  test('attempt zoom dialog with the full prompt @screens', async ({ page }, testInfo) => {
    const t = copyFor(testInfo);
    await page.goto('/play/mde?fixture=round-open&data=worst');
    await page
      .getByRole('button', { name: t.player.round.attempt.zoom.replace('{{number}}', '1') })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `e2e/screenshots/${testInfo.project.name}/zoom-attempt--worst.png`,
      animations: 'disabled',
    });
    await checkScreen(page);
    // Light dismiss: a tap outside the dialog closes it (closedby="any" or the Safari fallback).
    await page.mouse.click(5, 5);
    await expect(dialog).toBeHidden();
  });
});
