import type { NavigatorNode } from '@c8y/ngx-components';
import type { ChipSuggestion } from '../../services/search/query-chips';
import type { SearchResult } from '../../services/search/search.model';

/**
 * One selectable line in the global search palette.
 *
 * Pages, recently opened things and search results are different underneath but behave
 * identically once listed — they are all "somewhere you can go" — so the list, the keyboard
 * handling and the highlighting work on this single shape. A filter row is the one exception:
 * selecting it adds a chip to the query rather than going anywhere, and it shares the list so
 * one pair of arrow keys reaches both.
 */
export interface PaletteEntry {
  kind: 'recent' | 'page' | 'result' | 'filter';
  /** Stable within a render, and used as the DOM id for `aria-activedescendant`. */
  id: string;
  label: string;
  /** Ancestor labels, outermost first. */
  breadcrumb: string[];
  icon: string;
  /** Where selecting it goes. Router path segments; empty for a filter, which goes nowhere. */
  route: string[];
  /** Present for a filter row: selecting it adds this chip instead of navigating. */
  suggestion?: ChipSuggestion;
  /** Present for search results, so the row can show its type and alarms. */
  result?: SearchResult;
  /** Position in the flattened list, so the keyboard can cross group boundaries. */
  index: number;
}

/** A labelled run of entries, as rendered. */
export interface EntryGroup {
  key: string;
  label: string;
  entries: PaletteEntry[];
}

/** A navigator entry, flattened out of the tree. */
export interface PageEntry {
  label: string;
  breadcrumb: string[];
  icon: string;
  path: string;
}

const DEFAULT_PAGE_ICON = 'window-restore';

/**
 * Flattens the navigator tree into the leaves a person can actually open.
 *
 * Only nodes with a path are kept: a node without one is either a grouping label or an
 * *acting* entry that overrides `click()` (the explorer drawer's "Tree" entry is one — see
 * `asset-navigator/…/tree-navigator.node.ts`), and listing either would offer a row that
 * navigates nowhere. The ancestors' labels become the breadcrumb, which is what makes two
 * identically named leaves under different parents tellable apart.
 */
export function flattenNavigatorNodes(
  nodes: readonly NavigatorNode[],
  trail: readonly string[] = []
): PageEntry[] {
  const pages: PageEntry[] = [];

  for (const node of nodes) {
    const label = typeof node.label === 'string' ? node.label : '';
    const children = Array.isArray(node.children) ? node.children : [];

    if (typeof node.path === 'string' && node.path.length > 0 && label.length > 0) {
      pages.push({
        label,
        breadcrumb: [...trail],
        icon: typeof node.icon === 'string' && node.icon.length > 0 ? node.icon : DEFAULT_PAGE_ICON,
        path: node.path,
      });
    }

    if (children.length > 0) {
      pages.push(...flattenNavigatorNodes(children, label.length > 0 ? [...trail, label] : trail));
    }
  }

  return dedupeByPath(pages);
}

/** The navigator can surface the same route more than once; the list should not. */
function dedupeByPath(pages: readonly PageEntry[]): PageEntry[] {
  const seen = new Map<string, PageEntry>();

  for (const page of pages) {
    const key = `${page.breadcrumb.join('/')}/${page.path}`;

    if (!seen.has(key)) seen.set(key, page);
  }

  return [...seen.values()];
}

/** Router segments for a navigator path, which may or may not be absolute. */
export function toRoute(path: string): string[] {
  return ['/', ...path.split('/').filter((segment) => segment.length > 0)];
}
