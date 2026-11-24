# prompt-battle-ui

Angular 22 single-page app for Prompt Battle: player (phone), stage (projector) and admin screens, one set per city.
Specs live in the parent repo `prompt-battle-kit`: `docs/SPEC.md`, `docs/API.md` (the contract), `docs/PLAN.md`, `DESIGN.md`. If this repo is cloned alone, read them on GitHub (ewcastroh/prompt-battle-kit).

## Commands

| Task                                                         | Command                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Install                                                      | `npm ci`                                                          |
| Dev server, real API at `config.json`                        | `npm start` → http://localhost:4200                               |
| Dev server, in-browser fake API                              | `npm run start:fake` (`ng serve -c fake`)                         |
| Dev server for a phone on the same Wi-Fi, real API           | `npm run start:lan` (prints URLs and the API env vars)            |
| Same, fake API (UI only)                                     | `npm run start:fake:lan`, then open `http://<LAN IP>:4200`        |
| Unit tests (Vitest)                                          | `npm run test:ci` (watch: `npm test`)                             |
| Lint / format                                                | `npm run lint`, `npm run format:check` (`npm run format` to fix)  |
| Translation key parity                                       | `npm run i18n:check`                                              |
| Production build                                             | `npm run build` → `dist/prompt-battle-ui/browser`                 |
| Playwright smoke (fake API, starts its own server on :4321)  | `npm run e2e`                                                     |
| Every player screen, stage scene and admin view, screenshots | `npm run e2e:screens` → `e2e/screenshots/` (git-ignored)          |
| **Full verification (run before saying a phase is done)**    | `npm run verify && npm run e2e && npm run e2e:screens`            |
| Full two-city event on the real API (Compose stack up first) | `PB_ADMIN_TOKEN_MDE=… PB_ADMIN_TOKEN_BOG=… npm run e2e:compose`   |
| Docker image (local only; production is Pages)               | `docker build -t prompt-battle-ui .` (`API_BASE_URL` at run time) |

Fake admin tokens (fake backend only): `fake-admin-token-mde-0123456789`, `fake-admin-token-bog-0123456789`.
Fake prompt hooks: `[blocked]` → BLOCKED, `[fail]` → FAILED, `[sim=0.83]` → that cosine.
Fake dev tools (`npm run start:fake` only): `/play/mde?dev` shows a "Demo data / Worst case" toolbar; `/play/mde?fixture=<screen>&data=demo|worst` pins a player screen (list in `src/app/fake-backend/fake-fixtures.ts`); `/stage/mde?scene=<name>&data=demo|worst` (also `/admin/mde?scene=…`) plays the fake event up to a stage phase (list in `src/app/fake-backend/fake-scenes.ts`); Playwright drives admin actions, scenes and the fake clock through `window.__pbFake`. Each tab has its own fake event: a stage tab and an admin tab don't share state.

## Project rules

- **Versions are pinned exactly** in `package.json`. Never upgrade implicitly; ask before adding any dependency.
- **API contract:** only `docs/API.md`. Models in `src/app/core/api/api.models.ts` mirror it; change the contract first.
- **API base URL:** runtime `public/config.json` (D-017), loaded by `AppConfig` before routing. Request paths starting with `/api/` or `/img/` get the base URL from `apiBaseUrlInterceptor`; images in templates use the `apiUrl` pipe. Never hard-code an API origin.
- **Errors:** callers receive `ApiError { status, code, params }` from `problemInterceptor`; show `errors.<CODE>` via `errorMessage()`. Never show API `detail` text. UI-only codes: `NETWORK_ERROR`, `UNKNOWN`.
- **i18n:** Transloco, Spanish default, files `public/i18n/es.json` and `en.json` with identical keys and params. Every string goes through them (only `src/boot-error.ts` has a last-resort copy, for when even the translation file can't load).
- **Theme:** `ThemeService` + the inline script in `src/index.html` (DESIGN.md §2). The `<meta name="color-scheme">` is the single source; CSS maps it back to `color-scheme`. Use `.theme-if-light` / `.theme-if-dark` for non-color branches.
- **CSS:** `@layer reset, tokens, base, layout, components, utilities`. Tokens in `src/styles/tokens.css`; components use semantic tokens only and wrap their styles in `@layer components`. No `font-size` on `:root`/`html`. Sizes in `rem`, logical properties.
- **Phone on the LAN:** `npm run start:lan` writes git-ignored `.lan/config.json` and serves it as `config.json` via the `lan` build configuration (`public/config.json` stays untouched). The phone is plain http, so no secure-context APIs (`crypto.randomUUID`, clipboard, service workers, ...) outside the fake backend. `40-config.sh` accepts http for localhost, private IPv4 ranges and `*.local`; `scripts/write-config.mjs` (deploys) stays https-only.
- **Fake backend:** `src/app/fake-backend/`, wired only by the `fake` build configuration (fileReplacements). Production bundles must never contain it (nor its fixtures and dev tools).
- **Player state:** `features/player/player-state.service.ts` is the only code that calls the player endpoints (polls `/api/me` ≤ 1.5 s with `If-None-Match`). Screens read its signals; one polite live region (`core/ui/announcer.ts`) speaks for the whole page.
- **Stage (`features/stage/`):** `StageStateService` is the only caller of the stage endpoint (1.5 s, ETag, never pauses). One scene per phase, each fitting one screen at 1920×1080 and 1280×720 (no scroll). Images sit in size containers (`.stage-fit`, `.stage-pair`). Long user text uses `.fit-text`/`.fit-title`, which `StageAutoFit` shrinks only when a scene would overflow (D-026; cells that clip are marked `.fit-watch`). Confetti (canvas-confetti) runs only with `prefers-reduced-motion: no-preference`.
- **Admin (`features/admin/`):** the token is per city (`pb.admin.<city>`), checked with `/api/admin/me` against the route's city; a 401 anywhere signs out. `AdminApi` is the only caller of admin endpoints; run actions go through `AdminStateService.act` (one at a time). Tables sit in a focusable named `.table-region` (it contains its absolutely positioned descendants); consequential actions use `ConfirmDialog`.
- **Tests:** unit tests next to the code (Vitest); e2e in `e2e/` (Playwright + `@axe-core/playwright`: no AXE violations, no third-party requests, tap targets ≥ 44 px, no horizontal scroll). Tests tagged `@desktop` run on the desktop projects (stage, admin on a laptop); the rest on the phone projects.
- **No runtime CDN calls.** Fonts are in `public/fonts` (declared in `index.html` so URLs follow the base href); icons are copied Lucide SVGs in `shared/icon` (see `THIRD_PARTY_NOTICES.md`); canvas-confetti is an npm dependency, bundled into a lazy chunk.
- Run the `modern-web-guidance` skill before writing HTML/CSS/client JS for a pattern. Mobile first (360×800), tap targets ≥ 44 px, WCAG 2.2 AA in both themes.
- Never commit secrets. Commits are made as the owner; no AI attribution trailers.
- Branches: one branch per change, never work on `main` (D-028). Check `git branch --show-current` before editing; if it is `main`, create `<phase-or-type>/<short-topic>` first. `main` only changes through a pull request that the owner merges.

## Angular conventions

You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

### TypeScript

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

### Angular

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

### Accessibility

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- Do NOT import `CommonModule`, import only the directives and pipes the template uses, such as `AsyncPipe` or `DatePipe`
- When using external templates/styles, use paths relative to the component TS file.

### State management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

### Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

### Services

- Design services around a single responsibility
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection

### Tests

- Vitest, zoneless: Act → `await fixture.whenStable()` → Assert. No `fixture.detectChanges()`.
- Use `RouterTestingHarness` for routing and `HttpTestingController` for HTTP. Never mock the router.
