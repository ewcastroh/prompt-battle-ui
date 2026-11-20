import { HttpInterceptorFn } from '@angular/common/http';
import { EnvironmentProviders, provideAppInitializer } from '@angular/core';
import { fakeBackendInterceptor } from './fake-backend.interceptor';
import { installFakeDevTools } from './fake-dev-tools';

/** `fake` build configuration only (angular.json fileReplacements). */
export const fakeBackendInterceptors: readonly HttpInterceptorFn[] = [fakeBackendInterceptor];

/** Fixture token, Playwright hook and the optional `?dev` toolbar, before routing. */
export const fakeBackendProviders: readonly EnvironmentProviders[] = [
  provideAppInitializer(() => installFakeDevTools()),
];
