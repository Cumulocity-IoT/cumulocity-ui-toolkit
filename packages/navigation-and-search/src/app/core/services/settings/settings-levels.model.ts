import type { AssetHierarchy } from '../asset-store/asset-store.model';

/**
 * One asset type of the settings drawer's level strip: the unit the detail panel is configured
 * by (`DetailPanelConfig.types`), placed where it sits in the hierarchy the tree shows.
 */
export interface SettingsLevel {
  /** The managed-object `type` — the key of its field list. */
  type: string;
  /** Shallowest depth an asset of this type has in the tree; `null` when none is loaded. */
  depth: number | null;
  /** Assets of this type in the tree. */
  count: number;
  /** Some asset of this type has children (loaded or pending) — it shows subtree counts. */
  branch: boolean;
  /** The type has its own field list rather than falling back. */
  own: boolean;
  /** An asset of this type for the drawer's preview; `null` when none is loaded. */
  sampleId: string | null;
}

export interface SettingsLevels {
  /** Types present in the tree, from the root down: by depth, then by how common they are. */
  inTree: SettingsLevel[];
  /** Types with a stored field list but no asset in the tree, by type. */
  elsewhere: SettingsLevel[];
  /**
   * An asset the `default` list applies to, for its preview: the first leaf whose type has no
   * list of its own. `null` when every leaf type is configured.
   */
  defaultSampleId: string | null;
}

/**
 * The hierarchy's asset types as configurable levels, plus the configured types the tree does
 * not show. Pure: read by `NavigatorSettingsDrawerComponent`.
 */
export function settingsLevels(
  hierarchy: AssetHierarchy | null | undefined,
  configured: Readonly<Record<string, unknown>>
): SettingsLevels {
  const byType = new Map<string, SettingsLevel>();
  let defaultSampleId: string | null = null;

  for (const node of hierarchy?.byId.values() ?? []) {
    if (!node.type) continue;
    const branch = node.childIds.length > 0 || !!hierarchy?.pendingChildren.has(node.id);
    const level = byType.get(node.type);

    if (level) {
      level.count++;
      level.branch ||= branch;
      level.depth = Math.min(level.depth ?? node.depth, node.depth);
    } else {
      byType.set(node.type, {
        type: node.type,
        depth: node.depth,
        count: 1,
        branch,
        own: node.type in configured,
        sampleId: node.id,
      });
    }

    if (!branch && defaultSampleId === null && !(node.type in configured)) {
      defaultSampleId = node.id;
    }
  }

  const inTree = [...byType.values()].sort(
    (a, b) => (a.depth ?? 0) - (b.depth ?? 0) || b.count - a.count || a.type.localeCompare(b.type)
  );
  const elsewhere = Object.keys(configured)
    .filter((type) => !byType.has(type))
    .sort((a, b) => a.localeCompare(b))
    .map(
      (type): SettingsLevel => ({
        type,
        depth: null,
        count: 0,
        branch: false,
        own: true,
        sampleId: null,
      })
    );

  return { inTree, elsewhere, defaultSampleId };
}
