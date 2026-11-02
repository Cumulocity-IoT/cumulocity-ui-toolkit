import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatValue, resolveBinding } from './geo-map-binding';
import { GeoMapChartComponent, type GeoMapChartPoint } from './geo-map-chart.component';
import type {
  GeoMapBinding,
  GeoMapCategory,
  GeoMapFormat,
  GeoMapItem,
  GeoMapPopupSection,
} from './geo-map.types';

/**
 * Renders the JSON-configured popup sections for one item. The layout comes
 * from the config, never from the item: every configured section/row always
 * renders; missing values show a muted "—" so popups never shift between items.
 */
@Component({
  selector: 'ps-geo-map-popup',
  standalone: true,
  imports: [RouterLink, GeoMapChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ps-gm-popup__sections">
      @for (slot of slots(); track $index) {
        <div class="ps-gm-popup__slot" [class.ps-gm-popup__slot--half]="slot.half">
          @let section = slot.section;
          @switch (section.type) {
            @case ('header') {
              <div class="ps-gm-popup__header">
                <div class="ps-gm-popup__title">
                  @if (link(section.link); as target) {
                    <a [routerLink]="target" (click)="navigate.emit()">{{ text(section.title) }}</a>
                  } @else {
                    {{ text(section.title) }}
                  }
                </div>
                @if (section.subtitle) {
                  <div class="ps-gm-popup__subtitle text-muted">{{ text(section.subtitle) }}</div>
                }
              </div>
            }
            @case ('properties') {
              <div class="ps-gm-popup__section">
                @for (row of section.rows; track row.label) {
                  <div class="ps-gm-popup__row">
                    <span class="text-muted">{{ row.label }}</span>
                    @if (row.format === 'alarm-severities') {
                      <span class="ps-gm-popup__alarms">
                        @for (severity of alarmCounts(row.value); track severity.id) {
                          <span
                            class="ps-gm-popup__alarm status {{ severity.id }}"
                            [class.ps-gm-popup__alarm--zero]="!severity.count"
                            title="{{ severity.id }}"
                          >
                            <i class="dlt-c8y-icon-{{ severity.icon }}"></i>{{ severity.count }}
                          </span>
                        }
                      </span>
                    } @else {
                      <span>{{ text(row.value, row.format) }}</span>
                    }
                  </div>
                }
              </div>
            }
            @case ('kpi-bars') {
              <div class="ps-gm-popup__section ps-gm-popup__kpis">
                @for (bar of section.bars; track bar.label) {
                  <div class="ps-gm-popup__kpi">
                    <div class="ps-gm-popup__kpi-head">
                      <span class="text-muted">{{ bar.label }}</span>
                      <span
                        >{{ text(bar.value, 'number:1') }}
                        @if (bar.unit) {
                          &nbsp;{{ bar.unit }}
                        }
                      </span>
                    </div>
                    <div class="ps-gm-popup__kpi-track">
                      <div
                        class="ps-gm-popup__kpi-fill"
                        [style.width.%]="barPercent(bar)"
                        [style.background]="bar.color || 'var(--c8y-palette-status-info, #1776bf)'"
                      ></div>
                    </div>
                    <div class="ps-gm-popup__kpi-scale text-muted">
                      <span>{{ bar.min }}</span>
                      <span>{{ bar.max }}</span>
                    </div>
                  </div>
                }
              </div>
            }
            @case ('chart') {
              <div class="ps-gm-popup__section">
                <ps-geo-map-chart
                  [kind]="section.kind"
                  [data]="chartData(section.data)"
                  [categories]="categories()"
                />
              </div>
            }
            @case ('table') {
              <div class="ps-gm-popup__section">
                <table class="ps-gm-popup__table">
                  <thead>
                    <tr>
                      @for (column of section.columns; track column.label) {
                        <th class="text-muted">{{ column.label }}</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (child of pagedChildren(section.pageSize ?? 5); track child.id) {
                      <tr>
                        @for (column of section.columns; track column.label) {
                          <td>{{ childText(child, column.value) }}</td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
                @if (pageCount(section.pageSize ?? 5) > 1) {
                  <div class="ps-gm-popup__pager">
                    <button
                      class="btn btn-default btn-xs"
                      [disabled]="page() === 0"
                      (click)="page.set(page() - 1)"
                    >
                      ‹
                    </button>
                    <span class="text-muted"
                      >{{ page() + 1 }} / {{ pageCount(section.pageSize ?? 5) }}</span
                    >
                    <button
                      class="btn btn-default btn-xs"
                      [disabled]="page() >= pageCount(section.pageSize ?? 5) - 1"
                      (click)="page.set(page() + 1)"
                    >
                      ›
                    </button>
                  </div>
                }
              </div>
            }
            @case ('actions') {
              <div class="ps-gm-popup__section ps-gm-popup__actions">
                @for (a of section.actions; track a.id) {
                  <button class="btn btn-default btn-xs" (click)="action.emit(a.id)">
                    @if (a.icon) {
                      <i class="dlt-c8y-icon dlt-c8y-icon-{{ a.icon }}"></i>
                    }
                    {{ a.label }}
                  </button>
                }
              </div>
            }
          }
        </div>
      }
    </div>
  `,
})
export class GeoMapPopupComponent {
  readonly item = input.required<GeoMapItem>();
  readonly sections = input.required<GeoMapPopupSection[]>();
  readonly categories = input<Map<string, GeoMapCategory>>(new Map());

  readonly action = output<string>();
  readonly navigate = output<void>();

  readonly page = signal(0);
  private readonly children = computed(() => this.item().children ?? []);

  /**
   * Automatic layout: without an explicit `layout`, parts size themselves by
   * content — charts, short property lists (≤4 rows), and small KPI groups
   * (≤2 bars) prefer half-width; header/table/actions take the full row. Two
   * consecutive half-preferring parts pair up; a lone one stretches to full.
   */
  readonly slots = computed(() => {
    const out: { section: GeoMapPopupSection; half: boolean }[] = [];
    let pending: number | null = null; // index of an as-yet unpaired half

    for (const section of this.sections()) {
      if (this.prefersHalf(section)) {
        if (pending !== null) {
          out[pending].half = true;
          out.push({ section, half: true });
          pending = null;
        } else {
          pending = out.length;
          out.push({ section, half: false });
        }
      } else {
        pending = null;
        out.push({ section, half: false });
      }
    }

    return out;
  });

  text(binding: GeoMapBinding, format?: GeoMapFormat): string {
    return formatValue(resolveBinding(this.item(), binding), format);
  }

  /** The c8y severity presentation (SeverityIconPipe icons + .status classes). */
  alarmCounts(binding: GeoMapBinding): { id: string; icon: string; count: number }[] {
    const value = (resolveBinding(this.item(), binding) ?? {}) as Record<string, number>;
    return [
      { id: 'critical', icon: 'exclamation-circle', count: value['critical'] ?? 0 },
      { id: 'major', icon: 'warning', count: value['major'] ?? 0 },
      { id: 'minor', icon: 'high-priority', count: value['minor'] ?? 0 },
      { id: 'warning', icon: 'circle', count: value['warning'] ?? 0 },
    ];
  }

  childText(child: GeoMapItem, binding: GeoMapBinding): string {
    return formatValue(resolveBinding(child, binding));
  }

  link(binding?: GeoMapBinding): string | unknown[] | null {
    const value = resolveBinding(this.item(), binding);
    return typeof value === 'string' || Array.isArray(value) ? value : null;
  }

  barPercent(bar: { value: GeoMapBinding; min: number; max: number }): number {
    const value = Number(resolveBinding(this.item(), bar.value));

    if (!Number.isFinite(value) || bar.max === bar.min) return 0;

    return Math.min(100, Math.max(0, ((value - bar.min) / (bar.max - bar.min)) * 100));
  }

  chartData(binding: GeoMapBinding): GeoMapChartPoint[] {
    const value = resolveBinding(this.item(), binding);
    return Array.isArray(value) ? (value as GeoMapChartPoint[]) : [];
  }

  pagedChildren(pageSize: number): GeoMapItem[] {
    const start = this.page() * pageSize;
    return this.children().slice(start, start + pageSize);
  }

  pageCount(pageSize: number): number {
    return Math.max(1, Math.ceil(this.children().length / pageSize));
  }

  private prefersHalf(section: GeoMapPopupSection): boolean {
    if (section.layout) return section.layout === 'half';

    switch (section.type) {
      case 'chart':
        return true;
      case 'properties':
        return section.rows.length <= 4;
      case 'kpi-bars':
        return section.bars.length <= 2;
      default:
        return false;
    }
  }
}
