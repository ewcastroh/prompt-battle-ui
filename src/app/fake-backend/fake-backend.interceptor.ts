import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpHeaders,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, delay, dematerialize, materialize, of, throwError } from 'rxjs';
import { FakeApi } from './fake-api';

/** Simulated network latency for every fake response. */
const LATENCY_MS = 120;

/** One fake backend per page load, shared by every request. */
let api: FakeApi | null = null;

/**
 * Answers `/api/**` requests from the in-memory {@link FakeApi} instead of the network.
 * Wired only by the `fake` build configuration (fileReplacements). Other requests pass through.
 */
export const fakeBackendInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const url = new URL(req.urlWithParams, document.baseURI);
  if (!url.pathname.startsWith('/api/')) {
    return next(req);
  }
  api ??= new FakeApi();
  const result = api.handle({
    method: req.method,
    path: url.pathname,
    query: url.searchParams,
    headers: req.headers,
    body: req.body,
  });
  const headers = new HttpHeaders(result.headers);
  const response$ =
    result.status >= 200 && result.status < 300
      ? of(
          new HttpResponse({
            status: result.status,
            body: toResponseType(result.body, req.responseType),
            headers,
            url: url.href,
          }),
        )
      : throwError(
          () =>
            new HttpErrorResponse({
              status: result.status,
              error: result.body,
              headers,
              url: url.href,
            }),
        );
  // materialize/dematerialize so errors are delayed too.
  return response$.pipe(materialize(), delay(LATENCY_MS), dematerialize());
};

function toResponseType(body: unknown, type: HttpRequest<unknown>['responseType']): unknown {
  if (type === 'blob' && typeof body === 'string') {
    return new Blob([body], { type: 'text/csv;charset=utf-8' });
  }
  if (type === 'text' && typeof body !== 'string') {
    return JSON.stringify(body);
  }
  return body;
}
