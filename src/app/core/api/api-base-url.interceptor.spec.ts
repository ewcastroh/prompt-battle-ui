import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppConfig } from '../config/app-config';
import { apiBaseUrlInterceptor, isApiPath } from './api-base-url.interceptor';

describe('apiBaseUrlInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiBaseUrlInterceptor])),
        provideHttpClientTesting(),
        { provide: AppConfig, useValue: { apiBaseUrl: 'https://api.example.test' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it.each(['/api/cities', '/api/me', '/img/abc.jpg'])('prefixes %s with API_BASE_URL', (path) => {
    http.get(path).subscribe();
    backend.expectOne(`https://api.example.test${path}`).flush({});
  });

  it.each(['i18n/es.json', 'config.json', 'https://other.example/api/x'])(
    'leaves %s alone',
    (url) => {
      http.get(url).subscribe();
      backend.expectOne(url).flush({});
    },
  );

  it('only treats /api and /img roots as API paths', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/apix/y')).toBe(false);
    expect(isApiPath('/images/x')).toBe(false);
  });
});
