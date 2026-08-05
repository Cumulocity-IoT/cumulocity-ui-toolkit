import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const LS_KEY = 'c8y-idb-cache-active';

/**
 * Persists the global IndexedDB cache enable/disable toggle in `localStorage`
 * and broadcasts changes as a `BehaviorSubject` so interceptors and the UI
 * component can react without polling.
 *
 * The default value (when no entry exists in `localStorage`) is **enabled**.
 */
@Injectable({ providedIn: 'root' })
export class CacheStateService {
  readonly isActive$ = new BehaviorSubject<boolean>(this.readStorage());

  get isActive(): boolean {
    return this.isActive$.value;
  }

  setActive(active: boolean): void {
    try {
      localStorage.setItem(LS_KEY, String(active));
    } catch {
      /* private browsing / storage quota exceeded */
    }

    this.isActive$.next(active);
  }

  private readStorage(): boolean {
    try {
      const raw = localStorage.getItem(LS_KEY);

      return raw === null ? true : raw === 'true';
    } catch {
      return true;
    }
  }
}
