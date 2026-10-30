import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { AssetTreeService } from '../core/components/asset-tree/asset-tree.service';
import { humanizeInventoryKey } from '../core/components/inventory-field-picker/inventory-field.model';
import {
  ALARM_SEVERITIES,
  type AlarmSeverityKey,
} from '../core/services/asset-store/asset-store.model';
import { AssetStoreService } from '../core/services/asset-store/asset-store.service';
import { NavigatorSettingsService } from '../core/services/settings/navigator-settings.service';
import { propertyOptions, type PropertyOption } from '../core/services/settings/settings-catalog';
import { settingsLevels } from '../core/services/settings/settings-levels.model';
import {
  PROPERTY_OPERATORS,
  treeFilterActive,
  type PropertyOperator,
  type TreeFilterCondition,
  type TreeFilterConfig,
  type TreeFilterTest,
} from '../core/services/settings/tree-filter.model';

type TestKind = TreeFilterTest['kind'];

const OPERATOR_LABELS: Record<PropertyOperator, string> = {
  equals: gettext('is'),
  notEquals: gettext('is not'),
  contains: gettext('contains'),
  exists: gettext('is set'),
  gt: gettext('is greater than'),
  lt: gettext('is less than'),
};

/**
 * The settings drawer's "Tree filter" tab: conditions that always narrow the asset tree
 * (`NavigatorSettings.treeFilter`, see `tree-filter.model.ts`). Each condition picks a level of
 * the hierarchy and a test on its assets; every change applies at once and the tab says how much
 * of the tree the filter hides.
 */
@Component({
  selector: 'ps-tree-filter-editor',
  templateUrl: './tree-filter-editor.component.html',
  styleUrl: './tree-filter-editor.component.less',
  imports: [CoreModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeFilterEditorComponent {
  private readonly settings = inject(NavigatorSettingsService);
  private readonly assets = inject(AssetStoreService);
  private readonly tree = inject(AssetTreeService);

  protected readonly config = computed(() => this.settings.settings().treeFilter);
  protected readonly active = computed(() => treeFilterActive(this.config()));
  protected readonly operators = PROPERTY_OPERATORS;
  protected readonly operatorLabels = OPERATOR_LABELS;
  protected readonly severities = ALARM_SEVERITIES;
  protected readonly label = humanizeInventoryKey;

  /** The tree's levels, root first — what a condition can be about. */
  protected readonly levels = computed(() =>
    settingsLevels(this.assets.hierarchy(), {}).inTree.map((level) => level.type)
  );

  protected readonly hidden = this.tree.hiddenByFilter;
  protected readonly total = this.assets.size;

  /** Property paths (with values seen) per type, for the pickers. Memoised per hierarchy. */
  private readonly options = computed(() => {
    const hierarchy = this.assets.hierarchy();
    const byType = new Map<string, PropertyOption[]>();

    return (type: string) => {
      let options = byType.get(type);

      if (!options) {
        options = propertyOptions(hierarchy, type);
        byType.set(type, options);
      }

      return options;
    };
  });

  protected propertiesOf(type: string): PropertyOption[] {
    return this.options()(type);
  }

  protected valuesOf(type: string, path: string): string[] {
    return this.propertiesOf(type).find((option) => option.path === path)?.values ?? [];
  }

  protected set<K extends keyof TreeFilterConfig>(key: K, value: TreeFilterConfig[K]): void {
    void this.settings.update({ treeFilter: { ...this.config(), [key]: value } });
  }

  protected add(): void {
    const type = this.levels()[1] ?? this.levels()[0];

    if (!type) return;
    this.setConditions([
      ...this.config().conditions,
      { type, test: { kind: 'alarms', atLeast: 'major' } },
    ]);
  }

  protected remove(index: number): void {
    this.setConditions(this.config().conditions.filter((_, i) => i !== index));
  }

  protected setType(index: number, type: string): void {
    this.patch(index, (condition) => {
      const { test } = condition;

      // Another level has other properties: keep the path when it has it too.
      if (
        test.kind === 'property' &&
        !this.propertiesOf(type).some((option) => option.path === test.path)
      ) {
        return { type, test: this.firstPropertyTest(type) ?? { kind: 'alarms', atLeast: 'major' } };
      }

      return { type, test };
    });
  }

  protected setKind(index: number, kind: TestKind): void {
    this.patch(index, (condition) => {
      switch (kind) {
        case 'property':
          return { ...condition, test: this.firstPropertyTest(condition.type) ?? condition.test };
        case 'alarms':
          return { ...condition, test: { kind: 'alarms', atLeast: 'major' } };
        case 'unavailable':
          return { ...condition, test: { kind: 'unavailable' } };
      }
    });
  }

  protected setSeverity(index: number, atLeast: AlarmSeverityKey): void {
    this.patch(index, (condition) => ({ ...condition, test: { kind: 'alarms', atLeast } }));
  }

  protected setProperty(
    index: number,
    change: { path?: string; op?: PropertyOperator; value?: string }
  ): void {
    this.patch(index, (condition) => {
      if (condition.test.kind !== 'property') return condition;
      const path = change.path ?? condition.test.path;
      const op = change.op ?? condition.test.op;
      // A new path starts from one of its own values rather than the old path's.
      const value =
        change.value ??
        (change.path
          ? (this.valuesOf(condition.type, path)[0] ?? '')
          : (condition.test.value ?? ''));

      return {
        ...condition,
        test:
          op === 'exists' ? { kind: 'property', path, op } : { kind: 'property', path, op, value },
      };
    });
  }

  /**
   * A property test on the level's first property, with its first value — never an empty path,
   * which the stored contract would drop. `null` for a level whose assets have no properties.
   */
  private firstPropertyTest(type: string): TreeFilterTest | null {
    const [first] = this.propertiesOf(type);

    return first
      ? { kind: 'property', path: first.path, op: 'equals', value: first.values[0] ?? '' }
      : null;
  }

  private patch(
    index: number,
    change: (condition: TreeFilterCondition) => TreeFilterCondition
  ): void {
    this.setConditions(
      this.config().conditions.map((condition, i) => (i === index ? change(condition) : condition))
    );
  }

  private setConditions(conditions: TreeFilterCondition[]): void {
    void this.settings.update({ treeFilter: { ...this.config(), conditions } });
  }
}
