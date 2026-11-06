import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { BottomDrawerRef, CoreModule } from '@c8y/ngx-components';
import { AssetDetailPanelComponent } from '../core/components/asset-tree/asset-detail-panel.component';
import { DetailFieldConfigComponent } from '../core/components/asset-tree/detail-field-config.component';
import { RollupConfigComponent } from '../core/components/asset-tree/rollup-config.component';
import {
  ALARM_SEVERITIES,
  type AlarmSeverityKey,
} from '../core/services/asset-store/asset-store.model';
import { treeFilterActive } from '../core/services/settings/tree-filter.model';
import { TreeFilterEditorComponent } from './tree-filter-editor.component';
import { humanizeInventoryKey } from '../core/components/inventory-field-picker/inventory-field.model';
import { AssetStoreService } from '../core/services/asset-store/asset-store.service';
import { SearchShortcutService } from '../core/services/search/search-shortcut.service';
import {
  LIST_LIMIT,
  type NavigatorSettings,
} from '../core/services/settings/navigator-settings.model';
import { NavigatorSettingsService } from '../core/services/settings/navigator-settings.service';
import {
  settingsLevels,
  type SettingsLevel,
} from '../core/services/settings/settings-levels.model';
import { chordFromEvent, parseChord } from '../core/services/shortcuts/chord';

export type SettingsTab = 'general' | 'levels' | 'filter';

/** Strip value standing for the `default` list (a type can never be empty). */
const DEFAULT_LEVEL = '';

/**
 * The navigation-and-search settings, in a bottom drawer opened from the explorer drawer's cog
 * (`BottomDrawerService`). Two tabs:
 *
 * - **General**: what the tree shows, its keyboard shortcut, list sizes, and the search's
 *   inventory fallback without the Digital Twin Manager.
 * - **Detail fields by level**: one entry per asset type of the hierarchy the tree shows, from
 *   the root down (`settingsLevels`), plus configured types the tree does not show and the
 *   default list. The field editor sits beside a live preview of the hover panel for an asset
 *   of that type.
 *
 * Every change applies and is stored at once — there is no save step (see
 * {@link NavigatorSettingsService} for where it is stored).
 */
@Component({
  selector: 'ps-navigator-settings-drawer',
  imports: [
    CoreModule,
    DetailFieldConfigComponent,
    RollupConfigComponent,
    TreeFilterEditorComponent,
    AssetDetailPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './navigator-settings-drawer.component.html',
  styleUrl: './navigator-settings-drawer.component.less',
  host: { class: 'd-contents' },
})
export class NavigatorSettingsDrawerComponent implements OnInit {
  protected readonly service = inject(NavigatorSettingsService);
  protected readonly settings = this.service.settings;
  protected readonly limit = LIST_LIMIT;
  protected readonly defaultLevel = DEFAULT_LEVEL;
  private readonly drawerRef = inject(BottomDrawerRef);
  private readonly assets = inject(AssetStoreService);

  /** The tab to open on — set through `initialState` (the tree's filter bar opens `filter`). */
  initialTab: SettingsTab = 'general';

  protected readonly tab = signal<SettingsTab>('general');
  protected readonly severities = ALARM_SEVERITIES;
  protected readonly dotSeverities = computed(() => this.settings().rollups.dotSeverities);
  protected readonly filterActive = computed(() => treeFilterActive(this.settings().treeFilter));
  protected readonly filterCount = computed(() => this.settings().treeFilter.conditions.length);
  protected readonly recording = signal(false);

  protected readonly shortcutLabel = computed(
    () => parseChord(this.settings().shortcut)?.label ?? ''
  );

  /** The global search chord — a tenant option, shown, not edited here. */
  protected readonly searchShortcutLabel = inject(SearchShortcutService).chord().label;

  protected readonly levels = computed(() =>
    settingsLevels(this.assets.hierarchy(), this.settings().detailPanel.types)
  );

  /**
   * The tree's types as one row per depth: siblings side by side, the hierarchy top-down. A
   * single strip would read as a parent → child path, which types of one depth are not.
   */
  protected readonly rows = computed(() => {
    const rows: { depth: number; levels: SettingsLevel[] }[] = [];

    for (const level of this.levels().inTree) {
      const depth = level.depth ?? 0;
      const last = rows[rows.length - 1];

      if (last?.depth === depth) last.levels.push(level);
      else rows.push({ depth, levels: [level] });
    }

    return rows;
  });

  /** The picked strip entry; `undefined` until the user picks, then the first level. */
  private readonly picked = signal<string | undefined>(undefined);

  /** The type being edited, or {@link DEFAULT_LEVEL}. Falls back when the pick disappears. */
  protected readonly selected = computed(() => {
    const { inTree, elsewhere } = this.levels();
    const picked = this.picked();

    if (
      picked === DEFAULT_LEVEL ||
      [...inTree, ...elsewhere].some((level) => level.type === picked)
    ) {
      return picked as string;
    }

    return inTree[0]?.type ?? DEFAULT_LEVEL;
  });

  protected readonly selectedLevel = computed<SettingsLevel | undefined>(() => {
    const { inTree, elsewhere } = this.levels();

    return [...inTree, ...elsewhere].find((level) => level.type === this.selected());
  });

  /** The field editor's input: `null` edits the default list. */
  protected readonly editedType = computed(() => this.selected() || null);

  protected readonly previewId = computed(() => {
    const level = this.selectedLevel();

    return level ? level.sampleId : this.levels().defaultSampleId;
  });

  /** Rollups are what a group summarises: shown for group levels and for the defaults. */
  protected readonly showRollups = computed(() => {
    const level = this.selectedLevel();

    return this.selected() === DEFAULT_LEVEL || !!level?.branch;
  });

  /** A group of the level (or, for the defaults, one without rollups of its own) for the values. */
  protected readonly rollupSampleId = computed(() => {
    const level = this.selectedLevel();

    if (level) return level.branch ? level.sampleId : null;
    const own = this.settings().rollups.types;

    for (const node of this.assets.hierarchy()?.byId.values() ?? []) {
      if (node.childIds.length && !(node.type in own)) return node.id;
    }

    return null;
  });

  protected readonly label = humanizeInventoryKey;

  constructor() {
    // Closing the drawer removes the field without a blur: never leave the explorer drawer's
    // shortcut muted by a recording that can no longer finish.
    inject(DestroyRef).onDestroy(() => this.stopRecording());
  }

  protected setDotSeverity(severity: AlarmSeverityKey, on: boolean): void {
    const current = this.dotSeverities();
    const dotSeverities = ALARM_SEVERITIES.filter((s) =>
      s === severity ? on : current.includes(s)
    );

    void this.service.update({ rollups: { ...this.settings().rollups, dotSeverities } });
  }

  protected pick(type: string): void {
    this.picked.set(type);
  }

  protected set<K extends keyof NavigatorSettings>(key: K, value: NavigatorSettings[K]): void {
    void this.service.update({ [key]: value });
  }

  protected setCount(key: 'maxPinned' | 'maxRecent', raw: string): void {
    const n = Number(raw);

    if (raw !== '' && Number.isFinite(n)) this.set(key, n);
  }

  protected startRecording(): void {
    this.recording.set(true);
    this.service.recordingShortcut.set(true);
  }

  protected stopRecording(): void {
    this.recording.set(false);
    this.service.recordingShortcut.set(false);
  }

  /**
   * While recording: the first modifier chord becomes the shortcut, Escape cancels. The
   * key never reaches the drawer's own `Esc` handler, so cancelling does not close it.
   */
  protected onShortcutKeydown(event: KeyboardEvent): void {
    if (!this.recording()) return;
    if (event.key === 'Tab') return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Escape') {
      this.stopRecording();

      return;
    }
    const chord = chordFromEvent(event);

    if (!chord) return;
    this.set('shortcut', chord);
    this.stopRecording();
  }

  protected clearShortcut(): void {
    this.set('shortcut', '');
  }

  protected reset(): void {
    void this.service.reset();
  }

  protected close(): void {
    void this.drawerRef.close();
  }

  ngOnInit(): void {
    this.tab.set(this.initialTab);
  }
}
