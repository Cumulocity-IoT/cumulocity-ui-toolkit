import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CoreModule } from '@c8y/ngx-components';
import { validateQuery } from '~components/query-display/query-validator';
import {
  BuilderKind,
  BuilderNode,
  BuilderOp,
  isGroup,
  isParseable,
  makeNode,
  parseToRoot,
  serializeNode,
  unwrapQuery,
} from './query-builder.model';

/**
 * Visual editor for a Cumulocity inventory query clause. Supports the full
 * serialisable grammar — comparisons (`eq/lt/le/gt/ge`), `has`, `hasany`,
 * `bygroupid`, `isinhierarchyof` — composed with `and`/`or`/`not` to any depth,
 * plus a raw-string escape hatch for hand-editing.
 *
 * The selected clause is written back to `filter[filterKey]` as a bare query
 * string (no `$filter=` wrapper), matching what the rest of the layered-map
 * pipeline (`filterToQueryString`) expects.
 */
@Component({
  selector: 'ps-query-builder-form',
  standalone: true,
  imports: [CommonModule, CoreModule, FormsModule],
  styles: [
    `
      .lm-qb-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }
      .lm-qb-children {
        margin-left: 14px;
        padding-left: 10px;
        border-left: 2px solid var(--c8y-component-border-color, #e5e5e5);
        margin-top: 8px;
      }
      .lm-qb-node + .lm-qb-node {
        margin-top: 8px;
      }
      .lm-qb-children > .lm-qb-node {
        margin-top: 8px;
      }
      .lm-qb-grow {
        flex: 1;
        min-width: 80px;
      }
      .lm-qb-kind {
        width: 150px;
        flex-shrink: 0;
      }
      .lm-qb-op {
        width: 84px;
        flex-shrink: 0;
      }
      .lm-qb-vt {
        width: 92px;
        flex-shrink: 0;
      }
      .lm-qb-combinator {
        width: 130px;
      }
      .lm-qb-actions {
        margin-top: 8px;
        display: flex;
        gap: 6px;
      }
    `,
  ],
  template: `
    <div class="card">
      <div class="card-header separator d-flex a-i-center j-c-between p-t-8 p-b-8">
        <h5 class="card-title m-b-0" translate>Query</h5>
        <div class="btn-group btn-group-sm" role="group">
          <button
            type="button"
            class="btn"
            [class.btn-primary]="mode === 'builder'"
            [class.btn-default]="mode !== 'builder'"
            (click)="switchToBuilder()"
            translate
          >
            Builder
          </button>
          <button
            type="button"
            class="btn"
            [class.btn-primary]="mode === 'raw'"
            [class.btn-default]="mode !== 'raw'"
            (click)="switchToRaw()"
            translate
          >
            Raw
          </button>
        </div>
      </div>

      <div class="card-block p-16">
        @if (mode === 'builder') {
          <ng-container
            *ngTemplateOutlet="nodeTpl; context: { node: root, parent: null, index: -1 }"
          ></ng-container>
        } @else {
          <textarea
            class="form-control"
            rows="3"
            [(ngModel)]="rawValue"
            (ngModelChange)="onRawChange()"
            placeholder="has(c8y_Position) and type eq 'Pump'"
          ></textarea>
          @if (rawMessages.length) {
            <div class="alert m-t-8 m-b-0" [class.alert-danger]="parseError" [class.alert-warning]="!parseError">
              @for (m of rawMessages; track m) {
                <div>{{ m }}</div>
              }
            </div>
          }
          <p class="text-muted small m-t-8 m-b-0">
            <i c8yIcon="info-circle" class="m-r-4"></i>
            <span translate>Switch to the builder to edit this query visually (only parseable queries can be converted).</span>
          </p>
        }
      </div>
    </div>

    <ng-template #nodeTpl let-node="node" let-parent="parent" let-index="index">
      <div class="lm-qb-node">
        <div class="lm-qb-row">
          @if (parent === null) {
            <span class="text-muted small" translate>Match</span>
            <div class="c8y-select-wrapper lm-qb-combinator">
              <select class="form-control input-sm" [(ngModel)]="node.kind" (ngModelChange)="emit()">
                <option value="and">{{ 'ALL (AND)' | translate }}</option>
                <option value="or">{{ 'ANY (OR)' | translate }}</option>
              </select>
            </div>
            <span class="text-muted small" translate>of the following</span>
          } @else {
            <div class="c8y-select-wrapper lm-qb-kind">
              <select
                class="form-control input-sm"
                [ngModel]="node.kind"
                (ngModelChange)="changeKind(parent, index, $event)"
              >
                <option value="comparison">{{ 'Comparison' | translate }}</option>
                <option value="has">has( )</option>
                <option value="hasany">hasany( )</option>
                <option value="bygroupid">bygroupid( )</option>
                <option value="isinhierarchyof">isinhierarchyof( )</option>
                <option value="not">{{ 'NOT' | translate }}</option>
                <option value="and">{{ 'AND group' | translate }}</option>
                <option value="or">{{ 'OR group' | translate }}</option>
              </select>
            </div>

            @switch (node.kind) {
              @case ('comparison') {
                <input
                  class="form-control input-sm lm-qb-grow"
                  [(ngModel)]="node.field"
                  (ngModelChange)="emit()"
                  [placeholder]="'field (e.g. type)' | translate"
                />
                <div class="c8y-select-wrapper lm-qb-op">
                  <select class="form-control input-sm" [(ngModel)]="node.operator" (ngModelChange)="emit()">
                    @for (op of operators; track op.value) {
                      <option [value]="op.value">{{ op.label }}</option>
                    }
                  </select>
                </div>
                <div class="c8y-select-wrapper lm-qb-vt">
                  <select class="form-control input-sm" [(ngModel)]="node.valueType" (ngModelChange)="emit()">
                    <option value="string">{{ 'Text' | translate }}</option>
                    <option value="number">{{ 'Number' | translate }}</option>
                    <option value="null">null</option>
                  </select>
                </div>
                @if (node.valueType !== 'null') {
                  <input
                    class="form-control input-sm lm-qb-grow"
                    [type]="node.valueType === 'number' ? 'number' : 'text'"
                    [(ngModel)]="node.value"
                    (ngModelChange)="emit()"
                    [placeholder]="'value' | translate"
                  />
                }
              }
              @case ('has') {
                <input
                  class="form-control input-sm lm-qb-grow"
                  [(ngModel)]="node.fragment"
                  (ngModelChange)="emit()"
                  [placeholder]="'fragment (e.g. c8y_Position)' | translate"
                />
              }
              @case ('hasany') {
                <input
                  class="form-control input-sm lm-qb-grow"
                  [(ngModel)]="node.fragments"
                  (ngModelChange)="emit()"
                  [placeholder]="'fragments, comma separated' | translate"
                />
              }
              @case ('bygroupid') {
                <input
                  class="form-control input-sm lm-qb-grow"
                  [(ngModel)]="node.ids"
                  (ngModelChange)="emit()"
                  [placeholder]="'group ids, comma separated' | translate"
                />
              }
              @case ('isinhierarchyof') {
                <input
                  class="form-control input-sm lm-qb-grow"
                  [(ngModel)]="node.ids"
                  (ngModelChange)="emit()"
                  [placeholder]="'root ids, comma separated' | translate"
                />
              }
            }

            @if (parent.kind !== 'not') {
              <button
                type="button"
                class="btn btn-clean btn-xs text-danger"
                (click)="onRemove(parent, index)"
                [title]="'Remove' | translate"
              >
                <i c8yIcon="trash-o"></i>
              </button>
            }
          }
        </div>

        @if (node.kind === 'and' || node.kind === 'or') {
          <div class="lm-qb-children">
            @for (child of node.children; track $index; let i = $index) {
              <ng-container
                *ngTemplateOutlet="nodeTpl; context: { node: child, parent: node, index: i }"
              ></ng-container>
            }
            @if (!node.children.length) {
              <p class="text-muted small m-b-0" translate>No conditions yet.</p>
            }
            <div class="lm-qb-actions">
              <button type="button" class="btn btn-default btn-xs btn-icon" (click)="addChild(node)">
                <i c8yIcon="plus-circle"></i>
                <span translate>Add condition</span>
              </button>
              <button type="button" class="btn btn-default btn-xs btn-icon" (click)="addGroup(node)">
                <i c8yIcon="plus-circle"></i>
                <span translate>Add group</span>
              </button>
            </div>
          </div>
        }

        @if (node.kind === 'not') {
          <div class="lm-qb-children">
            <ng-container
              *ngTemplateOutlet="nodeTpl; context: { node: node.child, parent: node, index: 0 }"
            ></ng-container>
          </div>
        }
      </div>
    </ng-template>
  `,
})
export class QueryBuilderFormComponent implements OnInit {
  @Input() filter!: Record<string, unknown>;
  @Input() filterKey = 'query';

  mode: 'builder' | 'raw' = 'builder';
  root: BuilderNode = { kind: 'and', children: [] };
  rawValue = '';
  rawMessages: string[] = [];
  parseError = false;

  readonly operators: { value: BuilderOp; label: string }[] = [
    { value: 'eq', label: 'eq (=)' },
    { value: 'lt', label: 'lt (<)' },
    { value: 'le', label: 'le (≤)' },
    { value: 'gt', label: 'gt (>)' },
    { value: 'ge', label: 'ge (≥)' },
  ];

  ngOnInit(): void {
    const existing = this.filter[this.filterKey];

    if (typeof existing === 'string' && existing.trim()) {
      const parsed = parseToRoot(existing);

      if (parsed) {
        this.root = parsed;
        this.rawValue = existing;
      } else {
        // Keep the user's string visible and editable; it just can't be shown
        // in the visual builder until the syntax is valid.
        this.rawValue = existing;
        this.mode = 'raw';
        this.validateRaw();
      }
    }
  }

  // ── Builder editing ───────────────────────────────────────────────────────

  emit(): void {
    const serialized = serializeNode(this.root);

    if (serialized) {
      this.filter[this.filterKey] = serialized;
    } else {
      delete this.filter[this.filterKey];
    }

    this.rawValue = serialized;
  }

  changeKind(parent: BuilderNode, index: number, kind: BuilderKind): void {
    const fresh = makeNode(kind);

    if (parent.kind === 'not') {
      parent.child = fresh;
    } else if (isGroup(parent) && parent.children) {
      parent.children[index] = fresh;
    }

    this.emit();
  }

  onRemove(parent: BuilderNode, index: number): void {
    if (isGroup(parent) && parent.children) {
      parent.children.splice(index, 1);
      this.emit();
    }
  }

  addChild(group: BuilderNode): void {
    if (isGroup(group) && group.children) {
      group.children.push(makeNode('comparison'));
      this.emit();
    }
  }

  addGroup(group: BuilderNode): void {
    if (isGroup(group) && group.children) {
      group.children.push(makeNode('and'));
      this.emit();
    }
  }

  // ── Mode switching ────────────────────────────────────────────────────────

  switchToBuilder(): void {
    if (this.mode === 'builder') {
      return;
    }

    const raw = this.rawValue.trim();

    if (!raw) {
      this.root = { kind: 'and', children: [] };
      this.mode = 'builder';
      this.emit();

      return;
    }

    const parsed = parseToRoot(raw);

    if (!parsed) {
      this.parseError = true;
      this.rawMessages = ['Cannot parse this query — fix the syntax before switching to the builder.'];

      return;
    }

    this.root = parsed;
    this.mode = 'builder';
    this.emit();
  }

  switchToRaw(): void {
    if (this.mode === 'raw') {
      return;
    }

    this.rawValue = serializeNode(this.root);
    this.mode = 'raw';
    this.validateRaw();
  }

  onRawChange(): void {
    this.validateRaw();

    const value = unwrapQuery(this.rawValue);

    if (value) {
      this.filter[this.filterKey] = value;
    } else {
      delete this.filter[this.filterKey];
    }
  }

  private validateRaw(): void {
    this.parseError = false;
    this.rawMessages = [];

    const raw = this.rawValue.trim();

    if (!raw) {
      return;
    }

    if (!isParseable(raw)) {
      this.parseError = true;
      this.rawMessages = ['Invalid query syntax.'];

      return;
    }

    // Parseable, but may still reference standard properties unsupported by
    // has()/hasany().
    this.rawMessages = validateQuery(raw);
  }
}
