import type { AssetDefinition } from '@c8y/ngx-components';
import type { TypeFacet } from '../search/search.model';

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
