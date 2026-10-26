import { ChangeDetectionStrategy, Component, type OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CoreModule } from '@c8y/ngx-components';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { humanizeInventoryKey, type InventoryField } from './inventory-field.model';

/** One row of the flattened fragment tree. */
interface FieldRow {
  path: string;
  key: string;
  label: string;
  depth: number;
  type: 'object' | 'string' | 'number' | 'boolean';
  hasChildren: boolean;
}

/**
 * Platform/meta fragments that are never useful as a displayed field — either because
 * they are plumbing, or because a renderer already has a dedicated presentation for
 * them (position, alarm counts, latest measurements).
 */
const SKIP_KEYS = new Set([
  'id',
  'self',
  'type',
  'owner',
  'lastUpdated',
  'creationTime',
  'childAssets',
  'childDevices',
  'childAdditions',
  'assetParents',
  'deviceParents',
  'additionParents',
  'c8y_LatestMeasurements', // datapoints have their own picker
  'c8y_Position', // the map draws it; the detail panel has a path row
  'c8y_ActiveAlarmsStatus', // covered by the alarm-count field/column
  'c8y_IsAsset',
  'c8y_IsDeviceGroup',
  'c8y_ExternalId',
  'c8y_Availability',
]);
const MAX_DEPTH = 4;
const SAMPLE_SIZE = 10;

/**
 * Modal picker for inventory fields: a tree view over the fragments **actually present**
 * on a sample of the assets in question, labeled with DTM property titles where known.
 * Only scalar leaves (string / number / boolean) are selectable; objects expand, arrays
 * are omitted entirely.
 *
 * Sample-driven rather than schema-driven on purpose: a DTM schema describes what an
 * asset type may carry, the sample describes what it does carry, and offering a field
 * that is empty on every asset is how a picker teaches users it is broken.
 *
 * Opened with `BsModalService.show(...)`; inputs come through `initialState`, the result
 * through {@link result}.
 */
@Component({
  selector: 'ps-inventory-field-picker',
  standalone: true,
  imports: [CoreModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-header dialog-header">
      <i c8yIcon="cubes"></i>
      <h4 id="modal-title">{{ 'Select inventory fields' | translate }}</h4>
      @if (subtitle) {
        <p class="text-muted small m-b-0">{{ subtitle }}</p>
      }
    </div>
    <div class="modal-body ps-ifp__body">
      @for (row of visibleRows(); track row.path) {
        <div class="d-flex a-i-center ps-ifp__row" [style.padding-left.px]="row.depth * 20">
          @if (row.hasChildren) {
            <button class="btn btn-clean p-4" (click)="toggleExpand(row.path)" type="button">
              <i [c8yIcon]="expanded().has(row.path) ? 'chevron-down' : 'chevron-right'"></i>
            </button>
            <i class="text-muted m-r-4" c8yIcon="folder-open"></i>
            <span>{{ row.label }}</span>
          } @else {
            <label class="c8y-checkbox m-b-0">
              <input
                [checked]="selected().has(row.path)"
                (change)="toggleSelect(row.path)"
                type="checkbox"
              />
              <span></span>
              {{ row.label }}
            </label>
            <span class="label label-default m-l-8 small">{{ row.type }}</span>
          }
        </div>
      } @empty {
        <p class="text-muted">{{ 'No inventory fragments found on these assets.' | translate }}</p>
      }
    </div>
    <div class="modal-footer d-flex a-i-center">
      <span class="text-muted small m-r-auto">
        {{ selected().size }} {{ 'selected' | translate }}
      </span>
      <button class="btn btn-default" (click)="close()" type="button">
        {{ 'Cancel' | translate }}
      </button>
      <button class="btn btn-primary" [disabled]="!selected().size" (click)="save()" type="button">
        {{ 'Add' | translate }}
      </button>
    </div>
  `,
  styles: [
    `
      .ps-ifp__body {
        max-height: 55vh;
        overflow-y: auto;
      }
      .ps-ifp__row {
        min-height: 28px;
      }
    `,
  ],
})
export class InventoryFieldPickerComponent implements OnInit {
  // Set via BsModalService initialState:
  /**
   * The assets to read the available fragments off. Plain records, not SDK models —
   * a managed object, or the asset store's `AssetNode.properties`, both work.
   */
  sampleRows: Readonly<Record<string, unknown>>[] = [];
  /** DTM property titles, so a known field is labeled the way the platform labels it. */
  dtmFields: InventoryField[] = [];
  /** Optional context line, e.g. the asset type being configured. */
  subtitle = '';

  private readonly bsModalRef = inject(BsModalRef);

  private resolveResult!: (fields: InventoryField[]) => void;
  private rejectResult!: (reason?: unknown) => void;
  /**
   * Resolves with the picked scalar fields; rejects on **any** dismissal — Cancel, the
   * backdrop, or `Esc`.
   *
   * That it settles on every path is load-bearing, not tidiness: a caller may hold state
   * open for the modal's lifetime (the asset tree's ⚙ panel locks its hover cascade, so the
   * pointer can leave for the modal without the panel unmounting underneath it), and a
   * promise that only ever settled from the footer buttons left that state pinned for good
   * the first time somebody clicked the backdrop.
   */
  readonly result = new Promise<InventoryField[]>((resolve, reject) => {
    this.resolveResult = resolve;
    this.rejectResult = reject;
  });

  /** `hide()` also fires `onHidden`, so both paths have to be idempotent. */
  private settled = false;

  private rows: FieldRow[] = [];
  protected readonly expanded = signal(new Set<string>());
  protected readonly selected = signal(new Set<string>());
  protected readonly visibleRows = signal<FieldRow[]>([]);

  ngOnInit(): void {
    this.rows = buildRows(this.sampleRows, this.dtmFields);
    this.updateVisible();

    // Dismissal by backdrop or `Esc` destroys this component without going through
    // `close()`, so `onHidden` is the only signal that covers every path. It is typed
    // optional on `BsModalRef` (only `BsModalService.show` populates it) — assert it rather
    // than degrade quietly, because the failure mode is an `await` that never returns.
    if (!this.bsModalRef.onHidden) {
      throw new Error(
        'InventoryFieldPickerComponent: BsModalRef.onHidden is missing — open this via ' +
          'BsModalService.show(), and re-check the ngx-bootstrap modal API if it is absent there.'
      );
    }
    this.bsModalRef.onHidden.subscribe(() => this.dismiss('dismissed'));
  }

  protected toggleExpand(path: string): void {
    this.expanded.update((current) => {
      const next = new Set(current);

      if (next.has(path)) next.delete(path);
      else next.add(path);

      return next;
    });
    this.updateVisible();
  }

  protected toggleSelect(path: string): void {
    this.selected.update((current) => {
      const next = new Set(current);

      if (next.has(path)) next.delete(path);
      else next.add(path);

      return next;
    });
  }

  private updateVisible(): void {
    const expanded = this.expanded();

    this.visibleRows.set(
      this.rows.filter((row) => {
        // A row is visible when every ancestor object is expanded.
        const parts = row.path.split('.');

        for (let i = 1; i < parts.length; i++) {
          if (!expanded.has(parts.slice(0, i).join('.'))) return false;
        }

        return true;
      })
    );
  }

  protected save(): void {
    const byPath = new Map(this.rows.map((row) => [row.path, row]));

    this.settled = true;
    this.resolveResult(
      [...this.selected()]
        .map((path) => byPath.get(path))
        .filter((row): row is FieldRow => !!row && row.type !== 'object')
        .map((row) => ({
          path: row.path,
          label: row.label,
          type: row.type as InventoryField['type'],
        }))
    );
    this.bsModalRef.hide();
  }

  protected close(): void {
    this.dismiss('cancelled');
    this.bsModalRef.hide();
  }

  private dismiss(reason: string): void {
    if (this.settled) return;
    this.settled = true;
    this.rejectResult(reason);
  }
}

/** Merge the sample objects into one flattened, depth-first fragment tree. */
function buildRows(
  samples: readonly Readonly<Record<string, unknown>>[],
  dtmFields: readonly InventoryField[]
): FieldRow[] {
  const labelByPath = new Map(dtmFields.map((field) => [field.path, field.label]));
  const rows: FieldRow[] = [];
  const emitted = new Set<string>();

  const walk = (value: unknown, path: string, key: string, depth: number): void => {
    if (depth > MAX_DEPTH || Array.isArray(value)) return;
    const type = typeof value;

    if (type === 'string' || type === 'number' || type === 'boolean') {
      if (emitted.has(path)) return;
      emitted.add(path);
      rows.push({
        path,
        key,
        label: labelByPath.get(path) ?? humanizeInventoryKey(key),
        depth,
        type,
        hasChildren: false,
      });

      return;
    }
    if (type !== 'object' || value === null) return;

    if (!emitted.has(path)) {
      emitted.add(path);
      rows.push({
        path,
        key,
        label: labelByPath.get(path) ?? humanizeInventoryKey(key),
        depth,
        type: 'object',
        hasChildren: true,
      });
    }

    for (const [childKey, childValue] of Object.entries(value)) {
      walk(childValue, `${path}.${childKey}`, childKey, depth + 1);
    }
  };

  // Merge top-level keys across the sample, keeping first-seen order.
  for (const mo of samples.slice(0, SAMPLE_SIZE)) {
    for (const [key, value] of Object.entries(mo)) {
      if (SKIP_KEYS.has(key)) continue;
      walk(value, key, key, 0);
    }
  }

  // Later samples may append subtrees out of place — sort segment-wise so children
  // always follow their parent and siblings are alphabetical.
  return rows.sort((a, b) => {
    const as = a.path.split('.');
    const bs = b.path.split('.');

    for (let i = 0; i < Math.min(as.length, bs.length); i++) {
      const cmp = as[i].localeCompare(bs[i]);

      if (cmp !== 0) return cmp;
    }

    return as.length - bs.length;
  });
}
