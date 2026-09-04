import { Injectable, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const LS_KEY = 'c8y-idb-abort-on-navigation';

/**
 * Persists the "cancel requests on navigation" toggle in `localStorage`, in the
 * same shape as {@link CacheStateService} so the drawer can treat both switches
 * identically.
 *
 * Unlike caching, the default here is **disabled**. Caching is transparent — a
 * served response is indistinguishable from a fetched one — whereas cancelling
 * turns a pending request into a rejection, which any call site that alerts on
 * failure will report as an error. That is a behaviour change the operator has
 * to opt into knowingly.
 */
@Injectable({ providedIn: 'root' })
export class NavigationAbortStateService {
  readonly isActive$ = new BehaviorSubject<boolean>(this.readStorage());

  /** Signal mirror of {@link isActive$} for template/`computed()` consumers. */
  readonly active = signal(this.isActive$.value);

  /**
   * How many requests have been cancelled since the page was loaded — the
   * drawer's feedback that the switch is doing something, in the same spirit as
   * the read-activity LED.
   */
  readonly cancelledCount = signal(0);

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
    this.active.set(active);
  }

  recordCancelled(count: number): void {
    this.cancelledCount.update((total) => total + count);
  }

  private readStorage(): boolean {
    try {
      return localStorage.getItem(LS_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
