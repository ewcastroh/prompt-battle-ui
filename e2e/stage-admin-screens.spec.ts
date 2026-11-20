import { Page, expect, test } from '@playwright/test';
import { STAGE_SCENES } from '../src/app/fake-backend/fake-scenes';
import {
  FAKE_ADMIN_TOKEN,
  STAGE_SIZES,
  checkScreen,
  copyFor,
  expectFitsScreen,
  expectNoAxeViolations,
  expectNoHorizontalScroll,
} from './support';

/**
 * Screenshot sweep for review (PLAN U3), into e2e/screenshots/<project>/ (git-ignored):
 * - every stage scene (`?scene=`), demo and worst-case data, at 1920×1080 and 1280×720, each one
 *   checked to fit the screen with no scrolling and no AXE violations;
 * - the admin console on a laptop and on a phone (360×800, plus 320 px reflow), with its dialogs.
 * Run with `npm run e2e:screens`.
 */

const DATA = ['demo', 'worst'] as const;
const LAPTOP = { width: 1366, height: 768 };

function shot(page: Page, name: string, fullPage = false) {
  return page.screenshot({
    path: `e2e/screenshots/${test.info().project.name}/${name}.png`,
    fullPage,
    animations: 'disabled',
  });
}

async function signIn(page: Page, path: string): Promise<void> {
  const t = copyFor(test.info());
  await page.goto(path);
  await page.getByLabel(t.admin.login.label).fill(FAKE_ADMIN_TOKEN.mde);
  await page.getByRole('button', { name: t.admin.login.submit }).click();
  await expect(page.getByRole('heading', { name: t.admin.control.title })).toBeVisible();
  // Panels load their data on their own schedule.
  await page.waitForTimeout(800);
}

test.describe('stage scenes', () => {
  for (const scene of STAGE_SCENES) {
    for (const data of DATA) {
      test(`stage ${scene} (${data}) @screens @desktop`, async ({ page }) => {
        await page.goto(`/stage/mde?scene=${scene}&data=${data}`);
        await expect(page.locator('main [class~="scene"]').first()).toBeVisible();
        await expect(page.getByText(copyFor(test.info()).stage.loading)).toBeHidden();
        // The count-up, the confetti and fonts settle.
        await page.waitForTimeout(2200);
        for (const size of STAGE_SIZES) {
          await page.setViewportSize(size);
          await page.waitForTimeout(300);
          await expectFitsScreen(page);
          await shot(page, `stage-${scene}--${data}--${size.width}x${size.height}`);
        }
        await expectNoAxeViolations(page);
      });
    }
  }
});

test.describe('admin console', () => {
  const ADMIN_SCENES = ['round-open', 'mini-1', 'podium-4'] as const;

  test('admin login @screens @desktop', async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await page.goto('/admin/mde');
    await expect(page.locator('pb-admin-login')).toBeVisible();
    await shot(page, 'admin-login--laptop');
  });

  for (const scene of ADMIN_SCENES) {
    for (const data of DATA) {
      test(`admin ${scene} (${data}) on a laptop @screens @desktop`, async ({ page }) => {
        await page.setViewportSize(LAPTOP);
        await signIn(page, `/admin/mde?scene=${scene}&data=${data}`);
        await expectNoHorizontalScroll(page);
        await expectNoAxeViolations(page);
        await shot(page, `admin-${scene}--${data}--laptop`, true);
      });

      test(`admin ${scene} (${data}) on a phone @screens`, async ({ page }) => {
        await signIn(page, `/admin/mde?scene=${scene}&data=${data}`);
        await checkScreen(page);
        await shot(page, `admin-${scene}--${data}--phone`, true);
        await page.setViewportSize({ width: 320, height: 800 });
        await expectNoHorizontalScroll(page);
      });
    }
  }

  test('admin login on a phone @screens', async ({ page }) => {
    await page.goto('/admin/mde');
    await expect(page.locator('pb-admin-login')).toBeVisible();
    await checkScreen(page);
    await shot(page, 'admin-login--phone');
  });

  test('admin dialogs: round builder and event reset @screens', async ({ page }) => {
    const t = copyFor(test.info());
    await signIn(page, '/admin/mde');
    await page.getByRole('button', { name: t.admin.rounds.new }).click();
    const builder = page.getByRole('dialog', { name: t.admin.roundForm.newTitle });
    await expect(builder).toBeVisible();
    await builder.getByLabel(t.admin.roundForm.name).fill('Café al amanecer');
    await builder
      .getByLabel(t.admin.roundForm.hiddenPrompt)
      .fill('a steaming cup of coffee at dawn in a small Antioquia town, watercolor');
    await builder.getByRole('button', { name: t.admin.roundForm.generateButton }).click();
    await expect(builder.getByRole('img', { name: t.admin.roundForm.previewAlt })).toBeVisible();
    await checkScreen(page);
    await shot(page, 'admin-dialog-round-builder--phone');
    await builder.getByRole('button', { name: t.admin.roundForm.create }).click();
    await expect(builder).toBeHidden();

    await page.getByRole('button', { name: t.admin.event.reset }).click();
    const reset = page.getByRole('dialog', { name: t.admin.event.resetTitle });
    await expect(reset).toBeVisible();
    await checkScreen(page);
    await shot(page, 'admin-dialog-reset--phone');
  });
});
