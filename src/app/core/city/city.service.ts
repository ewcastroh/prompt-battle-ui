import { HttpClient } from '@angular/common/http';
import { Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { City } from '../api/api.models';

/** The configured cities (`GET /api/cities`), fetched once and cached for the session. */
@Service()
export class CityService {
  private readonly http = inject(HttpClient);
  private readonly list = signal<readonly City[] | null>(null);
  private pending: Promise<readonly City[]> | null = null;

  readonly cities = this.list.asReadonly();
  readonly loaded = computed(() => this.list() !== null);

  /** Resolves the city list; concurrent callers share one request. A failure is not cached. */
  load(): Promise<readonly City[]> {
    const cached = this.list();
    if (cached) {
      return Promise.resolve(cached);
    }
    this.pending ??= firstValueFrom(this.http.get<City[]>('/api/cities'))
      .then((cities) => {
        this.list.set(cities);
        return cities;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  find(code: string): City | undefined {
    return this.list()?.find((city) => city.code === code);
  }
}
