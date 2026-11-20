import { DOCUMENT, Service, inject } from '@angular/core';

/** localStorage key of a city's player token (PLAN U2). A token belongs to exactly one city. */
export function tokenStorageKey(city: string): string {
  return `pb.token.${city}`;
}

/**
 * Player tokens, one per city, kept in localStorage (SPEC §3.1) so a reload or a discarded tab
 * returns to the same player. If storage is blocked, tokens live in memory for this visit only.
 */
@Service()
export class PlayerTokenStore {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly memory = new Map<string, string>();

  get(city: string): string | null {
    try {
      const stored = this.window?.localStorage.getItem(tokenStorageKey(city));
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
      this.window?.localStorage.setItem(tokenStorageKey(city), token);
    } catch {
      // Storage blocked: the token still works for this visit.
    }
  }

  clear(city: string): void {
    this.memory.delete(city);
    try {
      this.window?.localStorage.removeItem(tokenStorageKey(city));
    } catch {
      // Storage blocked: nothing persisted to remove.
    }
  }
}
