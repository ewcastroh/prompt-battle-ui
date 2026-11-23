import { defineConfig } from '@playwright/test';

/**
 * Full two-city event against the real API (PLAN I1), not the in-browser fake.
 *
 * Start the stack first (`docker compose up --build` in prompt-battle-kit, API on the `fake` profile),
 * then: `PB_ADMIN_TOKEN_MDE=… PB_ADMIN_TOKEN_BOG=… npm run e2e:compose`.
 * Optional: `PB_UI_URL` (default http://localhost:4200), `PB_API_URL` (default http://localhost:8080).
 * The run RESETS THE EVENT first. Screenshots go to e2e/screenshots/compose/ (git-ignored).
 */
export default defineConfig({
  testDir: './e2e/compose',
  testMatch: '*.compose.ts',
  outputDir: './e2e/.results-compose',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  expect: { timeout: 20_000 },
  use: { trace: 'retain-on-failure', actionTimeout: 30_000, navigationTimeout: 30_000 },
});
