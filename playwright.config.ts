import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the in-browser fake API (`ng serve -c fake`, PLAN U2).
 *
 * - `npm run e2e`: the player smoke test (@smoke) at 360×800 on Chromium in es/en × light/dark,
 *   plus one WebKit (iPhone engine) run in es/light.
 * - `npm run e2e:screens`: every player screen in demo and worst-case data (@screens), with
 *   screenshots in e2e/screenshots/ (git-ignored), in es/light and en/dark.
 *
 * A dedicated port keeps a developer's own `npm start` (real API) from being reused by mistake.
 */
const PORT = 4321;
const CI = !!process.env['CI'];

const phone = {
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
};

const chromiumPhone = {
  ...phone,
  browserName: 'chromium' as const,
  deviceScaleFactor: 2,
  userAgent: devices['Pixel 7'].userAgent,
};

const webkitPhone = {
  ...phone,
  browserName: 'webkit' as const,
  deviceScaleFactor: 3,
  userAgent: devices['iPhone 15'].userAgent,
};

type Lang = 'es' | 'en';
type Scheme = 'light' | 'dark';

/** Language and theme are per device in the app: `lang` in localStorage, theme from the OS. */
const variant = (lang: Lang, colorScheme: Scheme) => ({
  colorScheme,
  locale: lang === 'es' ? 'es-CO' : 'en-US',
  storageState: {
    cookies: [],
    origins: [
      { origin: `http://localhost:${PORT}`, localStorage: [{ name: 'lang', value: lang }] },
    ],
  },
});

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]] : [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run start:fake -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium-es-light',
      grep: /@smoke/,
      use: { ...chromiumPhone, ...variant('es', 'light') },
    },
    {
      name: 'chromium-es-dark',
      grep: /@smoke/,
      use: { ...chromiumPhone, ...variant('es', 'dark') },
    },
    {
      name: 'chromium-en-light',
      grep: /@smoke/,
      use: { ...chromiumPhone, ...variant('en', 'light') },
    },
    {
      name: 'chromium-en-dark',
      grep: /@smoke/,
      use: { ...chromiumPhone, ...variant('en', 'dark') },
    },
    { name: 'webkit-es-light', grep: /@smoke/, use: { ...webkitPhone, ...variant('es', 'light') } },
    {
      name: 'screens-es-light',
      grep: /@screens/,
      use: { ...chromiumPhone, ...variant('es', 'light') },
    },
    {
      name: 'screens-en-dark',
      grep: /@screens/,
      use: { ...chromiumPhone, ...variant('en', 'dark') },
    },
  ],
});
