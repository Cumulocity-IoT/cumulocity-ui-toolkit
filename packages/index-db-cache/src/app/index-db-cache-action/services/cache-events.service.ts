import { Injectable, signal } from '@angular/core';

/**
 * Broadcasts IndexedDB cache activity as signals so the UI can stay in sync
 * without polling or manual refreshes.
 *
 * The three cache services notify on every write, clear and read; consumers
 * ({@link CacheStatsService} for entry counts, the action component for the
 * read-activity indicator) react via `effect()`.
 */
@Injectable({ providedIn: 'root' })
export class CacheEventsService {
  /** Bumped whenever cached data was written or removed. */
  readonly changed = signal(0);

  /** Bumped whenever data was read back out of IndexedDB. */
  readonly readActivity = signal(0);

  notifyChanged(): void {
    this.changed.update((n) => n + 1);
  }

  notifyRead(): void {
    this.readActivity.update((n) => n + 1);
  }
}
