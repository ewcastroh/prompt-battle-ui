import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Real builds: no fake backend. The `fake` build configuration replaces this file with
 * `fake-backend.providers.fake.ts` (angular.json fileReplacements), so production bundles never
 * contain the fake.
 */
export const fakeBackendInterceptors: readonly HttpInterceptorFn[] = [];
