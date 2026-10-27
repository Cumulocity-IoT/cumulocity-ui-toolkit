import { splitByCase, upperFirst } from 'scule';

/**
 * A scalar inventory property, addressed by its dot path into the managed object.
 *
 * Lives in `shared` rather than in a plugin because both renderers that let a user pick
 * one — the overview's table columns / map popup and the asset tree's detail panel — speak
 * this shape. Adding a third means importing this, not redeclaring it.
 *
 * Kept in its own module, apart from the picker component: this file pulls in nothing but
 * `scule`, so the pure logic that depends on it (the detail panel's field vocabulary) stays
 * testable under Vitest without an Angular runtime.
 */
export interface InventoryField {
  /** Dot path into the MO; nested allowed. */
  path: string;
  label: string;
  type: 'number' | 'string' | 'boolean';
}

/**
 * `wnd_OperatingState` → "Operating State", `salesContractId` → "Sales Contract Id":
 * drop fragment-style vendor prefixes, split camel/snake case, capitalize each word.
 *
 * Exported because a caller that stores only the *path* of a picked field (the detail
 * panel does — the path is the whole spec) has to be able to re-derive the same label.
 */
export function humanizeInventoryKey(key: string): string {
  const withoutPrefix = /^[a-z0-9]+_[A-Z]/.test(key) ? key.replace(/^[a-z0-9]+_/, '') : key;
  return splitByCase(withoutPrefix)
    .filter((part) => part.trim())
    .map((part) => upperFirst(part))
    .join(' ');
}
