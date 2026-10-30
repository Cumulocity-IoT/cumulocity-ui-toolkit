/**
 * The stored shape of the search palette's recents, and the projection that reads it back.
 *
 * A dependency-free sibling of `recent-entries.service.ts` on purpose: the service injects
 * `UserPreferencesService`, so importing it drags in `@c8y/ngx-components` → `@c8y/bootstrap`,
 * which does not load under vitest's node environment. Keeping the logic that can actually be
 * wrong out here is what makes it testable — the same split as
 * `components/inventory-field-picker/inventory-field.model.ts`.
 */

/** What is persisted — enough to rebuild a row without refetching anything. */
export interface RecentEntry {
  kind: 'page' | 'result';
  id: string;
  label: string;
  breadcrumb: string[];
  icon: string;
  route: string[];
}

/** Few enough that the list stays scannable and never pushes results off screen. */
export const MAX_RECENT = 5;

/**
 * Known-good entries only, capped.
 *
 * Anything written by an older version of the palette is discarded rather than trusted: the
 * preference is user-writable storage, and a malformed row would otherwise render as a blank
 * line that navigates nowhere.
 */
export function projectRecent(raw: unknown): RecentEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is RecentEntry => {
      if (typeof entry !== 'object' || entry === null) return false;
      const candidate = entry as Partial<RecentEntry>;
      return (
        typeof candidate.label === 'string' &&
        typeof candidate.icon === 'string' &&
        Array.isArray(candidate.route) &&
        Array.isArray(candidate.breadcrumb)
      );
    })
    .slice(0, MAX_RECENT);
}
