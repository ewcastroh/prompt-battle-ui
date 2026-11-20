import { HttpBackend, HttpClient } from '@angular/common/http';
import { DOCUMENT, Service, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface RuntimeConfig {
  /** Origin (and optional path) of the API, without a trailing slash. */
  apiBaseUrl: string;
}

/**
 * Runtime configuration (D-017). `config.json` is fetched relative to `document.baseURI`, so the same
 * build works at `/` (Cloudflare Pages, Docker) and under `/prompt-battle-ui/` (GitHub Pages).
 * There is no hard-coded fallback: if loading fails, bootstrap fails and `main.ts` shows the boot error.
 */
@Service()
export class AppConfig {
  // HttpBackend skips interceptors: the config request must not depend on the config itself.
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly document = inject(DOCUMENT);
  private readonly config = signal<RuntimeConfig | null>(null);

  /** URL the config is fetched from. */
  get url(): string {
    return new URL('config.json', this.document.baseURI).href;
  }

  async load(): Promise<void> {
    const raw = await firstValueFrom(this.http.get<unknown>(this.url, { cache: 'no-cache' }));
    this.config.set(parseRuntimeConfig(raw));
  }

  get apiBaseUrl(): string {
    const config = this.config();
    if (!config) {
      throw new Error('AppConfig used before load()');
    }
    return config.apiBaseUrl;
  }
}

export function parseRuntimeConfig(raw: unknown): RuntimeConfig {
  const value =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)['apiBaseUrl'] : null;
  if (typeof value !== 'string') {
    throw new Error('config.json: "apiBaseUrl" must be a string');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('config.json: "apiBaseUrl" must be an absolute URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('config.json: "apiBaseUrl" must use http or https');
  }
  return { apiBaseUrl: value.replace(/\/+$/, '') };
}
