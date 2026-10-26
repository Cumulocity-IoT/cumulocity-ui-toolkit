import {
  defaultDetailPanel,
  normalizeDetailPanel,
  type DetailPanelConfig,
} from './detail-panel.model';

/** The asset tree's per-user settings, edited in the explorer drawer's options menu. */
export interface NavigatorSettings {
  /** Show the filter field in the drawer header. */
  showSearch: boolean;
  /** Chord that opens and closes the explorer drawer (`alt+shift+t`); empty = none. */
  shortcut: string;
  /** Show the "Pinned & Recent" row above the hierarchy. */
  showQuickAccess: boolean;
  /** Pinned assets listed at most. */
  maxPinned: number;
  /** Recently opened assets listed at most. */
  maxRecent: number;
  /**
   * Without the Digital Twin Manager (no subscription, no permission), fall back to the
   * inventory: searchable properties guessed from each asset's fragments, type chips from the
   * asset types present in the tree. Off: only DTM definitions are used.
   */
  inventoryFallback: boolean;
  /** The detail panel's fields per type — the documented data contract in `detail-panel.model.ts`. */
  detailPanel: DetailPanelConfig;
}

export const DEFAULT_SETTINGS: Readonly<NavigatorSettings> = {
  showSearch: true,
  shortcut: '',
  showQuickAccess: true,
  maxPinned: 10,
  maxRecent: 8,
  inventoryFallback: true,
  detailPanel: defaultDetailPanel(),
};

/** Bounds of the two list sizes (the menu's number fields use the same). */
export const LIST_LIMIT = { min: 1, max: 25 } as const;

/** Managed-object type that holds an SSO user's settings (one object per user, by owner). */
export const SETTINGS_MO_TYPE = 'ps_AssetNavigatorSettings';
/** Fragment of that object, and the user-preference key on the user object. */
export const SETTINGS_FRAGMENT = 'ps_AssetNavigatorSettings';

/** Defaults for missing or malformed fields, numbers clamped — stored data is never trusted. */
export function normalizeSettings(raw: unknown): NavigatorSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof NavigatorSettings, unknown>
  >;
  const bool = (key: 'showSearch' | 'showQuickAccess' | 'inventoryFallback'): boolean =>
    typeof value[key] === 'boolean' ? value[key] : DEFAULT_SETTINGS[key];
  const count = (key: 'maxPinned' | 'maxRecent'): number => {
    const n = Number(value[key]);

    return Number.isFinite(n)
      ? Math.min(LIST_LIMIT.max, Math.max(LIST_LIMIT.min, Math.round(n)))
      : DEFAULT_SETTINGS[key];
  };

  return {
    showSearch: bool('showSearch'),
    shortcut:
      typeof value.shortcut === 'string'
        ? value.shortcut.trim().toLowerCase()
        : DEFAULT_SETTINGS.shortcut,
    showQuickAccess: bool('showQuickAccess'),
    maxPinned: count('maxPinned'),
    maxRecent: count('maxRecent'),
    inventoryFallback: bool('inventoryFallback'),
    detailPanel: normalizeDetailPanel(value.detailPanel),
  };
}
