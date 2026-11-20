import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { problemInterceptor } from '../api/problem.interceptor';
import { cityGuard } from './city.guard';

@Component({ template: 'player' })
class PlayerStub {}

@Component({ template: 'error {{ code }} {{ city }}' })
class ErrorStub {
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly code = this.params.get('code');
  protected readonly city = this.params.get('city');
}

const CITIES = [
  { code: 'mde', name: 'Medellín' },
  { code: 'bog', name: 'Bogotá' },
];

describe('cityGuard', () => {
  let harness: RouterTestingHarness;
  let backend: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'play/:city', canActivate: [cityGuard], component: PlayerStub },
          { path: 'stage/:city', canActivate: [cityGuard], component: PlayerStub },
          { path: 'error', component: ErrorStub },
        ]),
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => backend.verify());

  /** The guard requests the city list asynchronously; wait for it. */
  const citiesRequest = () => vi.waitFor((): TestRequest => backend.expectOne('/api/cities'));

  it('activates a configured city', async () => {
    const navigation = harness.navigateByUrl('/play/mde');
    (await citiesRequest()).flush(CITIES);
    await navigation;

    expect(harness.routeNativeElement?.textContent).toContain('player');
    expect(TestBed.inject(Router).url).toBe('/play/mde');
  });

  it('shows CITY_NOT_FOUND for an unknown city and keeps the URL', async () => {
    const navigation = harness.navigateByUrl('/play/xyz');
    (await citiesRequest()).flush(CITIES);
    await navigation;

    expect(harness.routeNativeElement?.textContent).toContain('error CITY_NOT_FOUND xyz');
    // skipLocationChange: the address bar never switches to /error (it keeps what the person opened).
    expect(TestBed.inject(Location).path()).not.toContain('/error');
  });

  it('fetches the city list once and caches it', async () => {
    const first = harness.navigateByUrl('/play/mde');
    (await citiesRequest()).flush(CITIES);
    await first;

    await harness.navigateByUrl('/stage/bog');
    backend.expectNone('/api/cities');
    expect(harness.routeNativeElement?.textContent).toContain('player');
  });

  it('shows the loading error code when the list cannot be fetched, and retries next time', async () => {
    const failed = harness.navigateByUrl('/play/mde');
    (await citiesRequest()).error(new ProgressEvent('error'));
    await failed;
    expect(harness.routeNativeElement?.textContent).toContain('error NETWORK_ERROR mde');

    const retry = harness.navigateByUrl('/stage/mde');
    (await citiesRequest()).flush(CITIES);
    await retry;
    expect(harness.routeNativeElement?.textContent).toContain('player');
  });
});
