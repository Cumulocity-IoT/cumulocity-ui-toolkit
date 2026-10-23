import { Injectable, Signal, inject, signal } from '@angular/core';
import { UserPreferencesService } from '@c8y/ngx-components';
import { firstValueFrom } from 'rxjs';
import type { PaletteEntry } from '../../components/search-palette/palette-entry';
import { MAX_RECENT, projectRecent, type RecentEntry } from './recent-entries.model';

/**
 * Per-user preference key. Deliberately **not** `localStorage`, which is what the
 * `c8y-search` experiment used: this repo keeps per-user view state in
 * `UserPreferencesService` under `ps.*` (see `AssetTreeService`'s
 * `ps.assetNav.recent`), so a person's recents follow them between browsers.
 */
const PREF_RECENT = 'ps.search.recent';

/**
 * Remembers what was opened from the search palette, so reopening it offers those first.
 *
 * Reads once per session, lazily — the palette is the only reader, and a session that never
 * opens it should not pay a request.
 */
@Injectable({ providedIn: 'root' })
export class RecentEntriesService {
  private readonly preferences = inject(UserPreferencesService);
  private readonly entries = signal<readonly RecentEntry[]>([]);
  private loading: Promise<void> | null = null;

  /** Most recently opened first. */
  readonly recent: Signal<readonly RecentEntry[]> = this.entries.asReadonly();

  /** Loads the stored list. Safe to call repeatedly; reads at most once. */
  load(): Promise<void> {
    this.loading ??= this.read();

    return this.loading;
  }

  /** Records an opened entry, moving it to the front if it was already there. */
  async remember(entry: PaletteEntry): Promise<void> {
    if (entry.route.length === 0) return;

    const record: RecentEntry = {
      kind: entry.kind === 'result' ? 'result' : 'page',
      id: entry.id,
      label: entry.label,
      breadcrumb: entry.breadcrumb,
      icon: entry.icon,
      route: entry.route,
    };

    const key = record.route.join('/');
    const next = [
      record,
      ...this.entries().filter((existing) => existing.route.join('/') !== key),
    ].slice(0, MAX_RECENT);

    this.entries.set(next);
    await this.preferences.set(PREF_RECENT, next);
  }

  private async read(): Promise<void> {
    try {
      const raw = await firstValueFrom<unknown>(this.preferences.get(PREF_RECENT));

      this.entries.set(projectRecent(raw));
    } catch {
      // A search that cannot read preferences is still a working search.
      this.entries.set([]);
    }
  }
}
