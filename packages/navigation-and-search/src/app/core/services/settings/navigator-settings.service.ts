import { Injectable, inject, signal } from '@angular/core';
import { InventoryService, UserService } from '@c8y/client';
import { AppStateService } from '@c8y/ngx-components';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  SETTINGS_FRAGMENT,
  SETTINGS_MO_TYPE,
  type NavigatorSettings,
} from './navigator-settings.model';
import { defaultDetailPanel, type DetailField, type DetailPanelConfig } from './detail-panel.model';
import { defaultRollups, type RollupConfig, type RollupSet } from './rollup.model';
import { defaultTreeFilter } from './tree-filter.model';

/**
 * The asset tree's per-user settings.
 *
 * Where they live depends on the user:
 * - **Platform users**: on the user object, `customProperties.ps_AssetNavigatorSettings`
 *   (read with the current user, written by updating the current user — the rest of
 *   `customProperties` is kept).
 * - **SSO users** (`customProperties.userOrigin === 'OAUTH2'`, the platform's own test in
 *   `TenantUiService.getCurrentUserLoginMode`): their user object is owned by the identity
 *   provider and rewritten on login, so the settings go into a managed object of type
 *   {@link SETTINGS_MO_TYPE}, one per user, found by owner. The same object is used when a
 *   platform user may not update itself.
 *
 * Defaults apply until the stored value is read, and whenever reading fails — a setting is a
 * convenience, never a precondition for the tree.
 */
@Injectable({ providedIn: 'root' })
export class NavigatorSettingsService {
  private readonly users = inject(UserService);
  private readonly inventory = inject(InventoryService);
  private readonly appState = inject(AppStateService);

  private readonly state = signal<NavigatorSettings>({ ...DEFAULT_SETTINGS });
  /** The current settings (defaults until loaded). */
  readonly settings = this.state.asReadonly();
  /** Where the settings are stored, for the menu's hint. */
  readonly storage = signal<'user' | 'inventory'>('user');
  /** True while the settings drawer records a shortcut: the drawer's own chord must not fire then. */
  readonly recordingShortcut = signal(false);

  private loading: Promise<void> | null = null;
  private settingsObjectId: string | null = null;
  /** The write queue: one store at a time, so writes land in order and create one object. */
  private writes: Promise<void> = Promise.resolve();

  /** Reads the stored settings once; later calls return the same promise. */
  load(): Promise<void> {
    this.loading ??= this.read();

    return this.loading;
  }

  /**
   * Applies a change and stores the whole settings object. Waits for the stored settings
   * first — otherwise the read, landing later, would overwrite the change — and queues the
   * write behind any still running: each stores the then current state, so the last write
   * carries the latest settings, and a first save creates the settings object only once.
   */
  async update(change: Partial<NavigatorSettings>): Promise<void> {
    await this.load();
    this.state.set(normalizeSettings({ ...this.state(), ...change }));

    this.writes = this.writes.then(() =>
      this.write(this.state()).catch(() => {
        // Kept for this session; the next load starts from what was stored last.
      })
    );

    return this.writes;
  }

  /** Back to the defaults (stored too). */
  reset(): Promise<void> {
    return this.update({
      ...DEFAULT_SETTINGS,
      detailPanel: defaultDetailPanel(),
      rollups: defaultRollups(),
      treeFilter: defaultTreeFilter(),
    });
  }

  /**
   * Sets the detail fields of one type, or of the `default` list when `type` is `null`. The
   * list is normalized like stored data, so the editor cannot write what the contract forbids.
   */
  setDetailFields(type: string | null, fields: readonly DetailField[]): Promise<void> {
    const current = this.state().detailPanel;
    const next: DetailPanelConfig =
      type === null
        ? { ...current, default: [...fields] }
        : { ...current, types: { ...current.types, [type]: [...fields] } };

    return this.update({ detailPanel: next });
  }

  /** Drops a type's own list (it falls back to `default`), or restores the built-in `default`. */
  resetDetailFields(type: string | null): Promise<void> {
    const current = this.state().detailPanel;

    if (type === null) {
      return this.update({ detailPanel: { ...current, default: defaultDetailPanel().default } });
    }
    const types = { ...current.types };

    delete types[type];

    return this.update({ detailPanel: { ...current, types } });
  }

  /** Sets the rollups of one branch type, or the `default` set when `type` is `null`. */
  setRollups(type: string | null, set: RollupSet): Promise<void> {
    const current = this.state().rollups;
    const next: RollupConfig =
      type === null
        ? { ...current, default: set }
        : { ...current, types: { ...current.types, [type]: set } };

    return this.update({ rollups: next });
  }

  /** Drops a type's own rollups (it falls back to `default`), or restores the built-in default. */
  resetRollups(type: string | null): Promise<void> {
    const current = this.state().rollups;

    if (type === null)
      return this.update({ rollups: { ...current, default: defaultRollups().default } });
    const types = { ...current.types };

    delete types[type];

    return this.update({ rollups: { ...current, types } });
  }

  private async read(): Promise<void> {
    try {
      const { data: user } = await this.users.current();
      const custom = (user.customProperties ?? {}) as Record<string, unknown>;

      if (custom['userOrigin'] === 'OAUTH2') {
        this.storage.set('inventory');
        const stored = await this.readSettingsObject();

        if (stored) this.state.set(normalizeSettings(stored));

        return;
      }
      this.storage.set('user');
      if (custom[SETTINGS_FRAGMENT]) this.state.set(normalizeSettings(custom[SETTINGS_FRAGMENT]));
    } catch {
      // Defaults stand.
    }
  }

  private async write(settings: NavigatorSettings): Promise<void> {
    if (this.storage() === 'user') {
      try {
        const { data: user } = await this.users.current();
        const custom = (user.customProperties ?? {}) as Record<string, unknown>;

        await this.users.updateCurrent({
          customProperties: { ...custom, [SETTINGS_FRAGMENT]: settings },
        });

        return;
      } catch {
        // The user may not update itself: the settings object takes over from now on.
        this.storage.set('inventory');
      }
    }
    await this.writeSettingsObject(settings);
  }

  private async writeSettingsObject(settings: NavigatorSettings): Promise<void> {
    if (this.settingsObjectId) {
      await this.inventory.update({ id: this.settingsObjectId, [SETTINGS_FRAGMENT]: settings });

      return;
    }
    const user = this.userName();
    const { data } = await this.inventory.create({
      type: SETTINGS_MO_TYPE,
      name: `Asset navigator settings${user ? ` of ${user}` : ''}`,
      [SETTINGS_FRAGMENT]: settings,
    });

    this.settingsObjectId = data.id;
  }

  /** The user's own settings object (the newest, should there be several). */
  private async readSettingsObject(): Promise<unknown> {
    const owner = this.userName();

    if (!owner) return undefined;
    const { data } = await this.inventory.list({
      type: SETTINGS_MO_TYPE,
      owner,
      pageSize: 5,
      withTotalPages: false,
    });
    const object = [...data].sort((a, b) =>
      String(b.lastUpdated).localeCompare(String(a.lastUpdated))
    )[0];

    if (!object) return undefined;
    this.settingsObjectId = object.id;

    return (object as Record<string, unknown>)[SETTINGS_FRAGMENT];
  }

  private userName(): string | undefined {
    const user = this.appState.currentUser.value as { userName?: string; id?: string } | null;

    return user?.userName ?? user?.id;
  }
}
