import type {
  AssetHierarchy,
  AssetNode,
  AssetRollup,
} from '../../services/asset-store/asset-store.model';
import { EMPTY_ROLLUP } from '../../services/asset-store/asset-store.model';
import {
  searchAssets,
  type AssetSearchContext,
  type AssetSearchIndex,
  type MatchRange,
} from '../../services/asset-store/asset-search';

/**
 * Types and the pure flattening/filtering maths behind `ps-asset-tree`.
 * Design: `docs/FastNavigation/tree-component-design.md` §3.
 */

/**
 * Row height per density, in px. Fixed — the virtual viewport needs `itemSize`.
 *
 * Sized around the collapse control rather than around the text: at the previous 32/26 the
 * twisty was a ~14px target, which is below any reasonable hit-area and the first thing that
 * felt wrong in use. 36 leaves 6px around the 24px collapse button and gives the 14px row
 * label room to breathe — the two densities are currently the same height and differ only in
 * font scale (`.ps-tree--compact`).
 *
 * **Keep this in step with the type scale in the component stylesheets.** The viewport sizes
 * every slot from this number, so a font bump without a height bump crops descenders and a
 * height bump without a font bump leaves dead space in the row.
 */
export const ROW_HEIGHT = { comfortable: 36, compact: 36 } as const;

export interface AssetTreeConfig {
  /**
   * Where hover panels attach. `'right-edge'` = cascade off the container's right
   * edge (drawer). `'off'` = no hover panels at all (overlay — it has map + grid).
   */
  cascade: 'right-edge' | 'off';
  /** Row height + font scale. `'comfortable'` in the drawer, `'compact'` in the overlay. */
  density: 'comfortable' | 'compact';
  /** Show the rolled-up turbine count per branch row. */
  showCounts: boolean;
  /**
   * Start from **every branch open** instead of every branch closed.
   *
   * The drawer sets this `false` and opens a *path* instead — ancestors of "you are here"
   * plus that asset's own children, nothing deeper (see `AssetTreeComponent`'s reveal
   * effect). A fully expanded fleet is thousands of rows with the one row that matters
   * buried in them; the overlay can afford it because it is a search surface, the drawer
   * is a "where am I" surface.
   *
   * This is only the **default** for a branch nobody has touched, not a freeze: the user's
   * own open/closed decisions are recorded per branch (`AssetTreeService.expansion`) and
   * win over it, so the twisty works both ways. Freezing would have been simpler and wrong
   * — the collapse control would be visible, focusable and inert.
   *
   * Being a default rather than an inversion is also what lets the two containers *share*
   * one expansion state while disagreeing about where to start (AC-T3). See
   * `AssetTreeService.expansion` for what went wrong when they didn't.
   */
  expandAll: boolean;
  /**
   * Animate rows in on first render, staggered by depth, so the hierarchy reads as
   * unfolding level by level instead of appearing as a wall of rows. Suppressed under
   * `prefers-reduced-motion`.
   */
  revealByLevel: boolean;
}

export const DRAWER_TREE_CONFIG: AssetTreeConfig = {
  cascade: 'right-edge',
  density: 'comfortable',
  showCounts: true,
  expandAll: false,
  revealByLevel: false,
};

export const OVERLAY_TREE_CONFIG: AssetTreeConfig = {
  cascade: 'off',
  density: 'compact',
  showCounts: true,
  expandAll: true,
  revealByLevel: true,
};

/**
 * The filter the tree reads. This is the **level-agnostic** subset of the host
 * design's `FilterState` (`docs/FastNavigation/host-component-design.md` §3.2) —
 * search text and asset type. Level-specific KPI predicates (`columnFilters`) are
 * deliberately absent: a park has no `WTUR.W`, so pruning a tree on one is
 * meaningless (§3.5). When the full `NavigationStore` lands, this becomes a
 * projection of its `FilterState` rather than a second type.
 */
export interface TreeFilter {
  searchText: string;
  matchMode: 'exact' | 'startsWith' | 'contains';
  /** Empty = every type. */
  assetTypes: readonly string[];
  /** Optional subtree root — set only by an explicit "restrict to below this". */
  scope?: string;
}

export const EMPTY_TREE_FILTER: TreeFilter = {
  searchText: '',
  matchMode: 'contains',
  assetTypes: [],
};

/** One rendered row: everything the row component needs, already resolved. */
export interface AssetTreeRow {
  node: AssetNode;
  rollup: AssetRollup;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /**
   * This row is the asset the surrounding app is currently showing — "you are here".
   * Distinct from *selected*: selection is what the user is pointing at inside the tree —
   * it follows the pointer (hover) and the keyboard cursor together, so it moves without
   * anything being clicked — while `current` is where the application already is. The two
   * are often different rows.
   */
  current: boolean;
  /** An ancestor of the current asset — the path leading to "you are here". */
  onCurrentPath: boolean;
  /** Ranges of `node.name` that matched the search text, for marking. */
  matches: readonly { start: number; end: number }[];
}

/**
 * What "open this asset" means, as the tree emits it and a container acts on it.
 *
 * `view` names a **tab of the asset's page** rather than a route: the tree knows the user
 * asked for alarms, only the container knows what URL that is (`AssetNavigationService`).
 * Absent = the asset's default page. Shared as a type so the tree and both containers
 * cannot drift on the payload.
 */
export interface AssetActivation {
  node: AssetNode;
  newTab: boolean;
  view?: 'alarms';
}

export function rowIndent(depth: number): number {
  // §3.2: 8px gutter plus a 16px step per level — a quarter of the sidebar's 18px
  // indent budget being the whole point (P2).
  return 8 + depth * 16;
}

function typeAllowed(node: AssetNode, filter: TreeFilter): boolean {
  return filter.assetTypes.length === 0 || filter.assetTypes.includes(node.type);
}

/** What the search knows that the filter alone does not — the index and the user. */
export interface TreeSearchSource {
  /**
   * The fleet index (`AssetStoreService.searchIndex`). `null` is a valid state — before
   * the first sweep, and in the unit tests — and degrades to a literal name scan.
   */
  index: AssetSearchIndex | null;
  /** Ranking signals: bookmarks and where the user already is. */
  context?: AssetSearchContext;
}

/**
 * The filter's result: which nodes survive, which matched in their own right, and
 * everything the containers need to render *why*.
 */
export interface FilteredHierarchy {
  visible: Set<string>;
  matched: Set<string>;
  /** Matches best-first — the overlay's grid order. Tree order stays hierarchical. */
  order: string[];
  /** `<mark>` ranges per matched node, already merged and ordered. */
  ranges: Map<string, MatchRange[]>;
  /** Fields other than the name that matched, per node. */
  matchedFields: Map<string, string[]>;
  /** Nothing matched literally — the UI says "showing similar names". */
  fuzzy: boolean;
}

/**
 * Which nodes survive the filter, and which of them matched in their own right.
 *
 * Keeps every matching node **plus all its ancestors** (§3.5) — an ancestor is kept
 * as a path segment even when it does not match itself, otherwise a match would have
 * nothing to hang from. Descendants of a match are kept too — searching a park name must
 * not empty the park — **except when the result is fuzzy**, where the match is a guess and
 * its subtree is not something the user asked for.
 *
 * The matching itself is `asset-search.ts` — an inverted index over name, external id,
 * type, path, status, notes and the asset definition's own properties, with a literal and
 * a subsequence pass behind it. `fuzzy` says nothing matched literally, so callers mark
 * the right ranges and the UI can admit it.
 */
export function filterHierarchy(
  hierarchy: AssetHierarchy,
  filter: TreeFilter,
  search?: TreeSearchSource
): FilteredHierarchy | null {
  const searchText = filter.searchText.trim();
  const hasSearch = searchText.length > 0;
  const hasTypes = filter.assetTypes.length > 0;

  if (!hasSearch && !hasTypes && !filter.scope) return null; // unfiltered: no work

  const found = hasSearch
    ? searchAssets(
        search?.index ?? null,
        hierarchy,
        { searchText, matchMode: filter.matchMode },
        search?.context
      )
    : null;

  const matched = new Set<string>();
  let order: string[] = [];
  const ranges = found?.ranges ?? new Map<string, MatchRange[]>();
  const matchedFields = found?.matchedFields ?? new Map<string, string[]>();
  const fuzzy = found?.fuzzy ?? false;

  if (found) {
    // The type filter never falls back the way the name search does: a type the user
    // excluded from the tabs is an explicit choice, and loosening it would ignore the
    // click they just made.
    for (const id of found.order) {
      const node = hierarchy.byId.get(id);

      if (node && typeAllowed(node, filter)) {
        matched.add(id);
        order.push(id);
      }
    }
  } else {
    for (const node of hierarchy.byId.values()) {
      if (typeAllowed(node, filter)) matched.add(node.id);
    }
    order = [...matched];
  }

  const visible = new Set<string>();

  // Ancestors of every match.
  for (const id of matched) {
    let current: AssetNode | undefined = hierarchy.byId.get(id);

    while (current && !visible.has(current.id)) {
      visible.add(current.id);
      current = current.parentId ? hierarchy.byId.get(current.parentId) : undefined;
    }
  }

  // Descendants of every match — but **not** of a fuzzy one. Searching a park name must not
  // empty the park, so a match the user actually typed keeps its subtree. A similar-name
  // guess must not: nobody typed "West", and letting one guessed branch drag ninety turbines
  // back in made the filter look like it had not run at all (the whole result reads as
  // unfiltered whenever the guess lands on a branch high in the tree). Fuzzy is all-or-
  // nothing per result — the fallback passes only run when nothing matched literally — so
  // this is one decision for the whole set, not per hit.
  if (!fuzzy) {
    const stack = [...matched];

    while (stack.length) {
      const node = hierarchy.byId.get(stack.pop() as string);

      if (!node) continue;

      for (const childId of node.childIds) {
        if (!visible.has(childId)) {
          visible.add(childId);
          stack.push(childId);
        }
      }
    }
  }

  if (filter.scope) {
    const inScope = new Set<string>();
    const scopeStack = [filter.scope];

    while (scopeStack.length) {
      const id = scopeStack.pop() as string;

      if (inScope.has(id)) continue;
      inScope.add(id);
      scopeStack.push(...(hierarchy.byId.get(id)?.childIds ?? []));
    }
    for (const id of [...visible]) if (!inScope.has(id)) visible.delete(id);
    for (const id of [...matched]) if (!inScope.has(id)) matched.delete(id);
    order = order.filter((id) => matched.has(id));
  }

  return { visible, matched, order, ranges, matchedFields, fuzzy };
}

/**
 * The visible node list, flattened depth-first into rows.
 *
 * A pure function of (hierarchy, expansion, filter) — the requirement in §3.4 that
 * makes virtual scrolling possible. Every expanded branch contributes **all** its
 * children: no page size, no truncation marker, no "load more" (AC-T1).
 *
 * `autoExpanded` is kept separate from the user's `expanded` set so clearing the
 * filter restores the tree's prior shape exactly (§3.5).
 */
export function flatten(options: {
  hierarchy: AssetHierarchy | null;
  /**
   * The user's explicit open/closed decisions (`AssetTreeService.expansion`). A branch with
   * no entry falls back to `defaultOpen`.
   */
  expansion: ReadonlyMap<string, boolean>;
  autoExpanded: ReadonlySet<string>;
  filter: TreeFilter;
  /** `AssetTreeConfig.expandAll` — what a branch nobody has touched does. */
  defaultOpen?: boolean;
  /** The asset the surrounding app is currently showing; marks one row as `current`. */
  currentId?: string | null;
  /**
   * The filter result, computed once by `AssetTreeService.filtered`.
   *
   * Threaded in rather than recomputed because four callers used to need it per keystroke
   * — this function, `autoExpansionFor`, the tree's "no exact match" notice and the
   * overlay's result list — and each ran a full search of its own. Omit it (`undefined`)
   * and this falls back to filtering on the spot without an index, which is what the unit
   * tests do.
   */
  filtered?: FilteredHierarchy | null;
}): AssetTreeRow[] {
  const { hierarchy, expansion, autoExpanded, filter, defaultOpen, currentId } = options;

  if (!hierarchy) return [];

  const filtered =
    options.filtered === undefined ? filterHierarchy(hierarchy, filter) : options.filtered;
  const searchText = filter.searchText.trim();
  const rows: AssetTreeRow[] = [];

  // A `childAssets` cycle would recurse until the stack blows, and a node referenced by
  // two branches would otherwise be drawn twice. Both are data faults we cannot prevent
  // — the platform accepts either — so the walk refuses to visit an id a second time.
  const drawn = new Set<string>();

  const visit = (id: string, depth: number): void => {
    if (filtered && !filtered.visible.has(id)) return;
    if (drawn.has(id)) return;
    const node = hierarchy.byId.get(id);

    if (!node) return;
    drawn.add(id);

    const childIds = filtered
      ? node.childIds.filter((childId) => filtered.visible.has(childId))
      : node.childIds;
    // The user's decision wins over the container's default; a filter's auto-expansion wins
    // over both, because a match has to be reachable.
    const isExpanded = autoExpanded.has(id) || (expansion.get(id) ?? defaultOpen === true);
    // In `high-volume` mode a branch whose children are not loaded still has to offer the twisty
    // that loads them — otherwise nothing below the prefetched levels is reachable at all. While a
    // filter is active it is suppressed: the filter speaks about loaded data only, so inviting an
    // expand into unloaded children would promise matches this tree cannot judge.
    const pending = !filtered && hierarchy.pendingChildren.has(id);

    rows.push({
      node,
      rollup: hierarchy.rollup.get(id) ?? EMPTY_ROLLUP,
      depth,
      hasChildren: childIds.length > 0 || pending,
      expanded: isExpanded && (childIds.length > 0 || pending),
      current: currentId === id,
      onCurrentPath: false,
      // The pass that produced the match is the one that marks it — a fuzzy hit marked
      // with literal ranges renders with no marks at all and looks like an unexplained
      // row. `searchAssets` already resolved that per node.
      matches: searchText && filtered ? (filtered.ranges.get(id) ?? []) : [],
    });

    if (isExpanded) {
      for (const childId of childIds) visit(childId, depth + 1);
    }
  };

  const roots = filter.scope ? [filter.scope] : hierarchy.rootIds;

  for (const rootId of roots) visit(rootId, 0);

  // Mark the ancestors of the current asset, so the path leading to "you are here" is
  // legible in a fully expanded tree — with every branch open, a single highlighted row
  // is a needle in a haystack (§3.3).
  if (currentId) {
    const ancestors = new Set<string>();

    // `ancestors` doubles as the cycle guard: a cyclic parent chain (possible when the
    // sweep contains a `childAssets` cycle — see `linkHierarchy`) would otherwise walk
    // forever and hard-freeze the tab.
    for (
      let node = hierarchy.byId.get(currentId);
      node?.parentId && !ancestors.has(node.parentId);
    ) {
      ancestors.add(node.parentId);
      node = hierarchy.byId.get(node.parentId);
    }

    for (const row of rows) {
      if (ancestors.has(row.node.id)) row.onCurrentPath = true;
    }
  }

  return rows;
}

/**
 * Ancestors of every match, so the tree opens up around what the user typed without
 * touching their manual expansion set (§3.5). Returns an empty set when unfiltered.
 */
export function autoExpansionFor(
  hierarchy: AssetHierarchy | null,
  filter: TreeFilter,
  precomputed?: FilteredHierarchy | null
): Set<string> {
  const expanded = new Set<string>();

  if (!hierarchy) return expanded;
  const filtered = precomputed === undefined ? filterHierarchy(hierarchy, filter) : precomputed;

  if (!filtered) return expanded;

  for (const id of filtered.matched) {
    let node = hierarchy.byId.get(id);

    // Stopping at an ancestor already in `expanded` does double duty: an earlier match
    // has already opened everything above it, and a cyclic parent chain (possible when
    // the sweep contains a `childAssets` cycle — see `linkHierarchy`) terminates instead
    // of walking forever and freezing the tab.
    while (node?.parentId && !expanded.has(node.parentId)) {
      expanded.add(node.parentId);
      node = hierarchy.byId.get(node.parentId);
    }
  }

  return expanded;
}

/** Splits a name into marked/unmarked segments for the row template. */
export function markSegments(
  name: string,
  matches: readonly { start: number; end: number }[]
): { text: string; marked: boolean }[] {
  if (!matches.length) return [{ text: name, marked: false }];
  const segments: { text: string; marked: boolean }[] = [];
  let cursor = 0;

  for (const { start, end } of matches) {
    if (start > cursor) segments.push({ text: name.slice(cursor, start), marked: false });
    segments.push({ text: name.slice(start, end), marked: true });
    cursor = end;
  }
  if (cursor < name.length) segments.push({ text: name.slice(cursor), marked: false });

  return segments;
}
