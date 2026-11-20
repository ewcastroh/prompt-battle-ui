# Prompt Battle UI

Web app for **Prompt Battle: ¡Compila tu Imaginación!**, a live game at EPAM Community Palooza 2026 played at the same time in Medellín and Bogotá. Players write prompts on their phones, the API generates images with one shared model and seed, and each city's top 5 are revealed on its projector.

This repo is the UI: one Angular single-page app with three screens per city:

| Route          | Screen                                                           |
| -------------- | ---------------------------------------------------------------- |
| `/`            | Landing page with the cities (for testing; players arrive by QR) |
| `/play/:city`  | Player (phone, 360×800 and up)                                   |
| `/stage/:city` | Stage (projector, 1920×1080 and 1280×720)                        |
| `/admin/:city` | Admin console                                                    |

The API lives in [prompt-battle-api](https://github.com/ewcastroh/prompt-battle-api). Specs, decisions and the API contract live in [prompt-battle-kit](https://github.com/ewcastroh/prompt-battle-kit) (`docs/SPEC.md`, `docs/API.md`, `DESIGN.md`).

## Stack

Angular 22.3 (standalone, signals, zoneless), Transloco 8.4 (Spanish default, English), plain modern CSS with design tokens, Vitest, ESLint (angular-eslint) and Prettier. Node 24 LTS.

## Run locally

```bash
npm ci
npm run start:fake   # in-browser fake API, no backend needed → http://localhost:4200
npm start            # real API at the URL in public/config.json (default http://localhost:8080)
```

With the fake backend, the admin tokens are `fake-admin-token-mde-0123456789` and `fake-admin-token-bog-0123456789`.

To run the API and UI together, use `docker compose up --build` in the parent `prompt-battle-kit` folder.

## Verify

```bash
npm run verify   # lint, format check, translation key parity, unit tests, production build
```

## Configuration

The only setting is the API base URL, read at runtime from `config.json` next to `index.html`, so one build works everywhere:

- Local: `public/config.json` (`{ "apiBaseUrl": "http://localhost:8080" }`).
- CI: the deploy jobs write it from the GitHub Actions variable `API_BASE_URL` (`scripts/write-config.mjs`).
- Docker: the nginx entrypoint writes it from the `API_BASE_URL` environment variable.

No secrets ever reach the UI.

## Deploy

`.github/workflows/ci-cd.yml`:

- Pull requests: lint, format check, translation keys, unit tests, production build.
- Push to `main`: the same, then deploy to **Cloudflare Pages** (`prompt-battle-ui.pages.dev`, primary) and **GitHub Pages** (`ewcastroh.github.io/prompt-battle-ui/`, backup, built with base href `/prompt-battle-ui/` and a `404.html` copy for deep links).

Repository settings: secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; variable `API_BASE_URL`; Pages source "GitHub Actions". Details in the parent repo's `docs/DEPLOYMENT.md`.

## License notices

Fonts (SIL OFL 1.1) and icons (Lucide, ISC) are bundled; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
