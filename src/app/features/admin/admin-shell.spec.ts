import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { translocoTesting } from '../../../testing/transloco-testing';
import { problemInterceptor } from '../../core/api/problem.interceptor';
import { LanguageService } from '../../core/i18n/language.service';
import { AdminSessionService } from './admin-session.service';
import { AdminShell } from './admin-shell';
import { adminTokenKey } from './admin-token-store';

@Component({ template: '<p>cities page</p>' })
class CitiesStub {}

const TOKEN = 'admin-token-for-tests-000001';

describe('AdminShell navigation', () => {
  let harness: RouterTestingHarness;
  let backend: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    window.matchMedia ??= (() => null) as unknown as typeof window.matchMedia;
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [
        provideHttpClient(withInterceptors([problemInterceptor])),
        provideHttpClientTesting(),
        provideRouter(
          [
            { path: '', component: CitiesStub },
            { path: 'admin/:city', component: AdminShell },
          ],
          withComponentInputBinding(),
        ),
      ],
    });
    await TestBed.inject(LanguageService).init();
    backend = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    localStorage.clear();
    // The console's panels start their own requests once signed in; they aren't under test here.
    backend.match(() => true);
  });

  const element = () => harness.routeNativeElement as HTMLElement;
  const router = () => TestBed.inject(Router);

  async function openConsoleSignedIn(): Promise<void> {
    localStorage.setItem(adminTokenKey('mde'), TOKEN);
    await harness.navigateByUrl('/admin/mde');
    const me = await vi.waitFor(() => backend.expectOne('/api/admin/me'));
    me.flush({ city: 'mde', cityName: 'Medellín' });
    await vi.waitFor(() => expect(element().querySelector('nav.section-nav')).not.toBeNull());
  }

  it('signing out on purpose goes back to the cities page and forgets the token', async () => {
    await openConsoleSignedIn();
    const logout = element().querySelector<HTMLButtonElement>('button.logout')!;
    expect(logout.textContent).toContain('Cerrar sesión');

    logout.click();
    await vi.waitFor(() => expect(router().url).toBe('/'));

    expect(element().textContent).toContain('cities page');
    expect(localStorage.getItem(adminTokenKey('mde'))).toBeNull();
  });

  it('a 401 stays on the console, on the form, with its reason', async () => {
    await openConsoleSignedIn();
    const session = harness.routeDebugElement!.injector.get(AdminSessionService);

    session.expired();
    await harness.fixture.whenStable();

    expect(router().url).toBe('/admin/mde');
    expect(element().querySelector('pb-admin-login')).not.toBeNull();
    expect(element().textContent).toContain('Tu sesión terminó');
  });

  it('the section bar has a visible link to the cities page, next to Sign out', async () => {
    await openConsoleSignedIn();
    const nav = element().querySelector('nav.section-nav')!;
    const home = nav.querySelector<HTMLAnchorElement>('a.home')!;

    expect(home.getAttribute('href')).toBe('/');
    expect(home.textContent).toContain('Ver las ciudades');
    expect(home.querySelector('pb-icon')).not.toBeNull();
    expect(home.nextElementSibling).toBe(nav.querySelector('button.logout'));

    home.click();
    await vi.waitFor(() => expect(router().url).toBe('/'));
    expect(element().textContent).toContain('cities page');
  });

  it('the sign-in form links to the cities page', async () => {
    await harness.navigateByUrl('/admin/mde');
    await harness.fixture.whenStable();

    const home = element().querySelector<HTMLAnchorElement>('pb-admin-login a.home')!;
    expect(home.getAttribute('href')).toBe('/');
    expect(home.textContent).toContain('Ver las ciudades');

    home.click();
    await vi.waitFor(() => expect(router().url).toBe('/'));
  });

  it('puts the cities link in the settings popover too', async () => {
    await harness.navigateByUrl('/admin/mde');
    await harness.fixture.whenStable();

    const links = element().querySelectorAll<HTMLAnchorElement>('pb-settings-menu [popover] a');
    expect([...links].map((link) => link.getAttribute('href'))).toEqual(['/']);
  });
});
