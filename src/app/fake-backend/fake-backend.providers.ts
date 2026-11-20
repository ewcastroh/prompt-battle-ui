import { HttpInterceptorFn } from '@angular/common/http';
import { EnvironmentProviders } from '@angular/core';

/**
 * Real builds: no fake backend. The `fake` build configuration replaces this file with
 * `fake-backend.providers.fake.ts` (angular.json fileReplacements), so production bundles never
 * contain the fake or its dev tools.
 */
export const fakeBackendInterceptors: readonly HttpInterceptorFn[] = [];

export const fakeBackendProviders: readonly EnvironmentProviders[] = [];
