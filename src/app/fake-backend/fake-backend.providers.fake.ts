import { HttpInterceptorFn } from '@angular/common/http';
import { fakeBackendInterceptor } from './fake-backend.interceptor';

/** `fake` build configuration only (angular.json fileReplacements). */
export const fakeBackendInterceptors: readonly HttpInterceptorFn[] = [fakeBackendInterceptor];
