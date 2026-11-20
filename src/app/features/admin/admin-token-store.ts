import { DOCUMENT, Service, inject } from '@angular/core';

/** localStorage key of a city's admin token (D-020 #9). */
export function adminTokenKey(city: string): string {
  return `pb.admin.${city}`;
}

/**
 * Admin tokens, one per city, kept in localStorage so a reload keeps the console signed in (D-020
 * #9, with a log-out control). If storage is blocked, the token lives in memory for this visit.
 */
@Service()
export class AdminTokenStore {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly memory = new Map<string, string>();

  get(city: string): string | null {
    try {
      const stored = this.window?.localStorage.getItem(adminTokenKey(city));
      if (stored) {
        return stored;
      }
    } catch {
      // Storage blocked: fall back to this visit's memory.
    }
    return this.memory.get(city) ?? null;
  }

  set(city: string, token: string): void {
    this.memory.set(city, token);
    try {
      this.window?.localStorage.setItem(adminTokenKey(city), token);
    } catch {
      // Storage blocked: the token still works for this visit.
    }
  }

  clear(city: string): void {
    this.memory.delete(city);
    try {
      this.window?.localStorage.removeItem(adminTokenKey(city));
    } catch {
      // Storage blocked: nothing persisted to remove.
    }
  }
}
