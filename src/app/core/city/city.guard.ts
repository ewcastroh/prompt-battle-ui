import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { ApiError } from '../api/api-error';
import { CityService } from './city.service';

/**
 * Allows `/play/:city`, `/stage/:city` and `/admin/:city` only for a configured city (SPEC §10.1).
 * Otherwise shows the error page with `CITY_NOT_FOUND` (or the loading error) while keeping the URL,
 * so a mistyped QR link stays visible to the person reading it.
 */
export const cityGuard: CanActivateFn = async (route) => {
  const cities = inject(CityService);
  const router = inject(Router);
  const city = route.paramMap.get('city') ?? '';

  let code: string;
  try {
    await cities.load();
    if (cities.find(city)) {
      return true;
    }
    code = 'CITY_NOT_FOUND';
  } catch (error) {
    code = error instanceof ApiError ? error.code : 'UNKNOWN';
  }

  const target = router.createUrlTree(['/error'], { queryParams: { code, city } });
  return new RedirectCommand(target, { skipLocationChange: true });
};
