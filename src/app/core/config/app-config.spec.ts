import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppConfig, parseRuntimeConfig } from './app-config';

describe('AppConfig (D-017)', () => {
  let base: HTMLBaseElement;

  beforeEach(() => {
    base = document.createElement('base');
    document.head.prepend(base);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    base.remove();
    TestBed.inject(HttpTestingController).verify();
  });

  it('fetches config.json relative to the base href (GitHub Pages subpath)', async () => {
    base.href = '/prompt-battle-ui/';
    const config = TestBed.inject(AppConfig);
    const loading = config.load();

    const expected = new URL('/prompt-battle-ui/config.json', document.baseURI).href;
    TestBed.inject(HttpTestingController)
      .expectOne(expected)
      .flush({ apiBaseUrl: 'https://api.example.test/' });
    await loading;

    expect(config.url).toBe(expected);
    expect(config.apiBaseUrl).toBe('https://api.example.test');
  });

  it('fetches config.json at the root for base href "/"', async () => {
    base.href = '/';
    const config = TestBed.inject(AppConfig);
    const loading = config.load();
    TestBed.inject(HttpTestingController)
      .expectOne(new URL('/config.json', document.baseURI).href)
      .flush({ apiBaseUrl: 'http://localhost:8080' });
    await loading;
    expect(config.apiBaseUrl).toBe('http://localhost:8080');
  });

  it('fails (no hard-coded fallback) when config.json cannot be loaded', async () => {
    base.href = '/';
    const config = TestBed.inject(AppConfig);
    const loading = config.load();
    TestBed.inject(HttpTestingController)
      .expectOne(new URL('/config.json', document.baseURI).href)
      .flush('Not found', { status: 404, statusText: 'Not Found' });
    await expect(loading).rejects.toBeTruthy();
    expect(() => config.apiBaseUrl).toThrow();
  });

  it('validates the config shape', () => {
    expect(() => parseRuntimeConfig(null)).toThrow();
    expect(() => parseRuntimeConfig({})).toThrow();
    expect(() => parseRuntimeConfig({ apiBaseUrl: '/relative' })).toThrow();
    expect(() => parseRuntimeConfig({ apiBaseUrl: 'ftp://x.test' })).toThrow();
    expect(parseRuntimeConfig({ apiBaseUrl: 'https://x.up.railway.app//' })).toEqual({
      apiBaseUrl: 'https://x.up.railway.app',
    });
  });
});
