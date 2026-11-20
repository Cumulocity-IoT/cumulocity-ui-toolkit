import type { AssetDefinition } from '@c8y/ngx-components';
import { splitByCase, upperFirst } from 'scule';
import type { TypeFacet } from '../search/search.model';
import type { AssetHierarchy } from './asset-store.model';

/**
 * Projects the DTM asset-definition catalog into selectable type chips.
 *
 * Pure and dependency-free so it stays Vitest-testable, like the other `*.model.ts`
 * siblings here. Read by `AssetDefinitionService.typeFacets`.
 *
 * `identifier` is the value instances actually carry in their own `type` field — and so the
 * value the query language matches — while `jsonSchema.title` is only a display label. A
 * definition without a title falls back to the identifier rather than rendering a blank
 * chip.
 */
export function toTypeFacets(definitions: readonly AssetDefinition[]): TypeFacet[] {
  const byType = new Map<string, TypeFacet>();

  for (const definition of definitions) {
    const type = definition.identifier;

    if (typeof type !== 'string' || type.length === 0 || byType.has(type)) continue;

    const title = definition.jsonSchema?.title;
    const icon = (definition['icon'] as { name?: unknown } | undefined)?.name;

    byType.set(type, {
      type,
      label: typeof title === 'string' && title.length > 0 ? title : type,
      ...(typeof icon === 'string' && icon.length > 0 ? { icon } : {}),
      selected: false,
    });
  }

  return [...byType.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Type chips from the inventory, for a tenant without the Digital Twin Manager (settings drawer →
 * Inventory fallback): the distinct `type` values of the assets in the tree, labelled from the
 * identifier (`wind_turbine` → "Wind turbine"). No icons — those only come with definitions.
 */
export function inventoryTypeFacets(hierarchy: Pick<AssetHierarchy, 'byId'>): TypeFacet[] {
  const types = new Set<string>();

  for (const node of hierarchy.byId.values()) if (node.type) types.add(node.type);

  return [...types]
    .map((type) => ({ type, label: humanizeType(type), selected: false }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function humanizeType(type: string): string {
  const words = splitByCase(type.replace(/^c8y_/, '')).map((word) => word.toLowerCase());

  return upperFirst(words.join(' ')) || type;
}
