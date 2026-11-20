import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  type TemplateRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { CoreModule } from '@c8y/ngx-components';
import {
  type ContextWidgetConfig,
  WidgetConfigService,
} from '@c8y/ngx-components/context-dashboard';
import { IconSelectorWrapperComponent } from '@c8y/ngx-components/icon-selector';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { KpiTrendWidgetComponent } from './kpi-trend-widget.component';
import {
  DEFAULT_TREND_POINT_COUNT,
  DEFAULT_TREND_WINDOW,
  DEFAULT_VARIANT,
  type KpiTrendWidgetConfig,
} from './models/kpi-trend.model';

/** The config keys this section owns; `datapoints` belongs to the Data point section. */
type AppearanceConfig = Omit<KpiTrendWidgetConfig, 'datapoints'>;

/**
 * Clears the dialog's preview. `setPreview` is typed without `null`, but `null` is what the dialog
 * treats as "no preview", as the platform's own sections pass when they are destroyed.
 */
const NO_PREVIEW = null as unknown as TemplateRef<unknown>;

/**
 * Appearance config section for the KPI Trend widget.
 *
 * Covers: layout variant (with inline SVG previews so users know what they're choosing),
 * icon name, sparkline lookback window, sample count, and the higherIsBetter direction flag.
 * It also provides the dialog's widget preview, rendered from the draft config.
 *
 * Unlike the main `loadComponent` config UI, sections registered via `hookWidgetConfig` are not
 * handed the live config object as an `@Input` — `WidgetConfigSectionComponent` only forwards the
 * static `initialState` from registration. So this component reads/writes the shared config
 * itself via `WidgetConfigService`, the same way the stock `WidgetDatapointsSelectorComponent`
 * (used for the "Data point" section) does.
 */
@Component({
  selector: 'ps-kpi-trend-widget-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CoreModule,
    FormsModule,
    NgTemplateOutlet,
    PopoverModule,
    IconSelectorWrapperComponent,
    KpiTrendWidgetComponent,
  ],
  template: `
    <!-- ── Layout variant ──────────────────────────────────────────────── -->
    <div class="form-group">
      <label class="control-label m-b-16">
        {{ 'Layout variant' | translate }}
        <ng-container
          *ngTemplateOutlet="help; context: { $implicit: 'kpi-trend.config.layout-help' }"
        />
      </label>
      <div class="kpi-config__variants">
        <!-- Radial (A) preview card -->
        <label
          class="kpi-config__variant-card"
          [class.kpi-config__variant-card--selected]="config.variant === 'radial'"
        >
          <input
            class="sr-only"
            [(ngModel)]="config.variant"
            (ngModelChange)="persistConfig()"
            type="radio"
            name="kpiVariant"
            value="radial"
          />
          <!-- Static SVG sketch of Variant A -->
          <svg
            class="kpi-config__preview-svg"
            viewBox="0 0 96 110"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
          >
            <!-- Header row -->
            <rect
              x="8"
              y="8"
              width="10"
              height="10"
              rx="2"
              fill="var(--c8y-brand-primary,#1776bf)"
              opacity=".7"
            />
            <rect x="22" y="10" width="40" height="6" rx="2" fill="currentColor" opacity=".3" />
            <!-- Arc track (270° at r=36, cx=48,cy=64) -->
            <circle
              cx="48"
              cy="62"
              r="30"
              fill="none"
              stroke="var(--c8y-brand-primary,#1776bf)"
              stroke-width="5"
              opacity=".15"
              stroke-dasharray="141.4 188.5"
              transform="rotate(135 48 62)"
            />
            <!-- Arc value (~21%) -->
            <circle
              cx="48"
              cy="62"
              r="30"
              fill="none"
              stroke="var(--c8y-brand-primary,#1776bf)"
              stroke-width="5"
              stroke-linecap="round"
              stroke-dasharray="29.7 188.5"
              transform="rotate(135 48 62)"
            />
            <!-- Center value text -->
            <text
              x="48"
              y="60"
              text-anchor="middle"
              font-size="11"
              font-weight="700"
              fill="currentColor"
            >
              644
            </text>
            <text x="48" y="70" text-anchor="middle" font-size="6" fill="currentColor" opacity=".5">
              kW / 3000
            </text>
            <!-- Sparkline strip at the bottom -->
            <polyline
              fill="none"
              stroke="var(--c8y-brand-primary,#1776bf)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity=".8"
              points="8,100 18,97 28,99 38,93 48,91 58,95 68,92 78,90 88,93"
            />
          </svg>
          <span class="kpi-config__variant-name" translate>Radial primary</span>
          <span class="kpi-config__variant-desc text-muted small" translate>
            Dominant arc gauge — best when the ratio to max matters.
          </span>
        </label>

        <!-- Compact (B) preview card -->
        <label
          class="kpi-config__variant-card"
          [class.kpi-config__variant-card--selected]="config.variant === 'compact'"
        >
          <input
            class="sr-only"
            [(ngModel)]="config.variant"
            (ngModelChange)="persistConfig()"
            type="radio"
            name="kpiVariant"
            value="compact"
          />
          <!-- Static SVG sketch of Variant B (dark chrome) -->
          <svg
            class="kpi-config__preview-svg kpi-config__preview-svg--dark"
            viewBox="0 0 96 110"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="0" y="0" width="96" height="110" rx="6" fill="#101a26" />
            <!-- Icon badge -->
            <rect
              x="8"
              y="8"
              width="18"
              height="18"
              rx="4"
              fill="rgba(255,255,255,.08)"
              stroke="rgba(255,255,255,.14)"
              stroke-width="1"
            />
            <text x="17" y="20" text-anchor="middle" font-size="9" fill="#5db2f0">⚡</text>
            <!-- Label -->
            <rect x="30" y="11" width="34" height="5" rx="2" fill="rgba(255,255,255,.25)" />
            <!-- Small ring (75% fill) -->
            <circle
              cx="83"
              cy="17"
              r="8"
              fill="none"
              stroke="rgba(255,255,255,.14)"
              stroke-width="2.5"
              stroke-dasharray="50.3 62.8"
              transform="rotate(135 83 17)"
            />
            <circle
              cx="83"
              cy="17"
              r="8"
              fill="none"
              stroke="#5db2f0"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-dasharray="37.7 62.8"
              transform="rotate(135 83 17)"
            />
            <text
              x="83"
              y="20"
              text-anchor="middle"
              font-size="5"
              font-weight="700"
              fill="rgba(255,255,255,.85)"
            >
              21%
            </text>
            <!-- Value row -->
            <text x="8" y="52" font-size="18" font-weight="700" fill="#fff" letter-spacing="-0.5">
              644
            </text>
            <text x="52" y="50" font-size="10" font-weight="600" fill="rgba(255,255,255,.55)">
              kW
            </text>
            <!-- Sparkline -->
            <polyline
              fill="none"
              stroke="#5db2f0"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              points="8,78 18,72 28,76 38,66 48,63 58,70 68,67 78,62 88,65"
            />
            <!-- Footer divider + badge -->
            <line x1="8" y1="90" x2="88" y2="90" stroke="rgba(255,255,255,.1)" stroke-width="1" />
            <rect
              x="8"
              y="95"
              width="26"
              height="9"
              rx="2"
              fill="rgba(255,255,255,.08)"
              stroke="rgba(255,255,255,.14)"
              stroke-width=".5"
            />
            <text x="21" y="101" text-anchor="middle" font-size="5" fill="rgba(255,255,255,.55)">
              WTUR.W
            </text>
            <text
              x="75"
              y="101"
              text-anchor="middle"
              font-size="7"
              font-weight="700"
              fill="#0ca30c"
            >
              ▲ 3.1%
            </text>
          </svg>
          <span class="kpi-config__variant-name" translate>Compact tile</span>
          <span class="kpi-config__variant-desc text-muted small" translate>
            Value &amp; sparkline lead — best when recent movement matters most.
          </span>
        </label>
      </div>
    </div>

    <hr />

    <!-- ── Icon ────────────────────────────────────────────────────────── -->
    <div class="row">
      <div class="col-md-6">
        <c8y-form-group>
          <label>
            {{ 'Icon' | translate }}
            <ng-container
              *ngTemplateOutlet="help; context: { $implicit: 'kpi-trend.config.icon-help' }"
            />
          </label>
          <div>
            <c8y-icon-selector-wrapper
              [(ngModel)]="config.icon"
              (ngModelChange)="persistConfig()"
              name="kpiTrendIcon"
            ></c8y-icon-selector-wrapper>
          </div>
        </c8y-form-group>
      </div>

      <!-- ── Accent color ──────────────────────────────────────────────── -->
      <div class="col-md-6">
        <c8y-form-group>
          <label for="kpiTrendColor">
            {{ 'Accent color' | translate }}
            <ng-container
              *ngTemplateOutlet="help; context: { $implicit: 'kpi-trend.config.color-help' }"
            />
          </label>
          <!-- Framed like the icon selector beside it: same box, size and centring. -->
          <div class="kpi-config__color d-flex a-i-center j-c-center p-relative">
            <div class="c8y-colorpicker" [title]="'Change color' | translate">
              <input
                id="kpiTrendColor"
                [attr.aria-label]="'Color' | translate"
                [ngModel]="config.color || datapointColor() || '#1776bf'"
                (ngModelChange)="config.color = $event; persistConfig()"
                name="kpiTrendColor"
                type="color"
              />
              <span
                [style.background-color]="
                  config.color || datapointColor() || 'var(--c8y-brand-primary, #1776bf)'
                "
              ></span>
            </div>
            @if (config.color) {
              <button
                class="btn btn-link btn-xs kpi-config__color-reset"
                (click)="resetColor()"
                type="button"
                translate
              >
                Reset
              </button>
            }
          </div>
        </c8y-form-group>
      </div>
    </div>

    <!-- ── Trend window ──────────────────────────────────────────────────── -->
    <div class="row">
      <div class="col-md-4">
        <c8y-form-group>
          <label for="kpiTrendWindowAmount">
            {{ 'Trend window' | translate }}
            <ng-container
              *ngTemplateOutlet="help; context: { $implicit: 'kpi-trend.config.window-help' }"
            />
          </label>
          <input
            class="form-control"
            id="kpiTrendWindowAmount"
            [(ngModel)]="config.trendWindow!.amount"
            (ngModelChange)="persistConfig()"
            name="kpiTrendWindowAmount"
            type="number"
            min="1"
            max="365"
            step="1"
          />
        </c8y-form-group>
      </div>
      <div class="col-md-4">
        <c8y-form-group>
          <label for="kpiTrendWindowUnit" translate>Unit</label>
          <select
            class="form-control"
            id="kpiTrendWindowUnit"
            [(ngModel)]="config.trendWindow!.unit"
            (ngModelChange)="persistConfig()"
            name="kpiTrendWindowUnit"
          >
            <option value="minute" translate>Minutes</option>
            <option value="hour" translate>Hours</option>
            <option value="day" translate>Days</option>
          </select>
        </c8y-form-group>
      </div>
      <div class="col-md-4">
        <c8y-form-group>
          <label for="kpiTrendPointCount">
            {{ 'Sample count' | translate }}
            <ng-container
              *ngTemplateOutlet="help; context: { $implicit: 'kpi-trend.config.points-help' }"
            />
          </label>
          <input
            class="form-control"
            id="kpiTrendPointCount"
            [(ngModel)]="config.trendPointCount"
            (ngModelChange)="persistConfig()"
            name="kpiTrendPointCount"
            type="number"
            min="2"
            max="40"
            step="1"
          />
        </c8y-form-group>
      </div>
    </div>

    <!-- ── Min / Max ───────────────────────────────────────────────────────── -->
    <div class="row">
      <div class="col-md-4">
        <c8y-form-group>
          <label for="kpiTrendMin">
            {{ 'Min value' | translate }}
            <ng-container
              *ngTemplateOutlet="help; context: { $implicit: 'kpi-trend.config.min-help' }"
            />
          </label>
          <input
            class="form-control"
            id="kpiTrendMin"
            [(ngModel)]="config.min"
            [placeholder]="'From KPI' | translate"
            (ngModelChange)="persistConfig()"
            name="kpiTrendMin"
            type="number"
          />
        </c8y-form-group>
      </div>
      <div class="col-md-4">
        <c8y-form-group>
          <label for="kpiTrendMax">
            {{ 'Max value' | translate }}
            <ng-container
              *ngTemplateOutlet="help; context: { $implicit: 'kpi-trend.config.max-help' }"
            />
          </label>
          <input
            class="form-control"
            id="kpiTrendMax"
            [(ngModel)]="config.max"
            [placeholder]="'From KPI' | translate"
            (ngModelChange)="persistConfig()"
            name="kpiTrendMax"
            type="number"
          />
        </c8y-form-group>
      </div>
    </div>

    <hr />

    <!-- ── Higher is better ──────────────────────────────────────────────── -->
    <div class="form-group">
      <c8y-form-group>
        <label>
          {{ 'Trend direction' | translate }}
          <ng-container
            *ngTemplateOutlet="help; context: { $implicit: 'kpi-trend.config.direction-help' }"
          />
        </label>
        <div class="c8y-checkbox">
          <label>
            <input
              [(ngModel)]="config.higherIsBetter"
              (ngModelChange)="persistConfig()"
              type="checkbox"
              name="kpiTrendHigherIsBetter"
            />
            <span translate>Higher value is better (up trend = green)</span>
          </label>
        </div>
      </c8y-form-group>
    </div>

    <!-- Codex inline help: a btn-help button in the label, its text in a popover on focus. Same
         settings as the peer-deviation config, which sits in the same drawer: on body, bounded by
         the viewport so the drawer's scroll area does not flip it away from its button. -->
    <ng-template #help let-key>
      <button
        class="btn-help btn-help--sm"
        [attr.aria-label]="'Help' | translate"
        [popover]="key | translate"
        [container]="'body'"
        [placement]="'right'"
        [triggers]="'focus'"
        [boundariesElement]="'viewport'"
        type="button"
        containerClass="kpi-config__help-popover"
      ></button>
    </ng-template>

    <ng-template #widgetPreview>
      <ps-kpi-trend-widget [config]="previewConfig()" [preview]="true" />
    </ng-template>
  `,
  styles: [
    `
      ::ng-deep .kpi-config__help-popover {
        max-width: 360px;
      }

      /*
     * The icon selector's frame (c8y-icon-selector-wrapper): a 48px box with the platform's 1px
     * component border, its content centred. Restated because the wrapper's rule is scoped to it.
     */
      .kpi-config__color {
        height: 48px;
        border: 1px solid var(--c8y-root-component-border-color, #e3e5e8);
      }

      .kpi-config__color-reset {
        position: absolute;
        right: 8px;
      }

      /* The platform swatch is 20px; restate both sizes, the platform sets them on the box and the input. */
      .kpi-config__color .c8y-colorpicker,
      .kpi-config__color .c8y-colorpicker input {
        width: 32px;
        height: 32px;
      }

      .kpi-config__variants {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .kpi-config__variant-card {
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        border: 2px solid var(--c8y-root-component-border-color, #dfe4e8);
        border-radius: 10px;
        padding: 12px 10px 10px;
        width: 148px;
        transition:
          border-color 0.15s,
          box-shadow 0.15s;
        background: var(--c8y-root-component-background-default, #fff);

        &:hover {
          border-color: var(--c8y-brand-primary, #1776bf);
        }

        &--selected {
          border-color: var(--c8y-brand-primary, #1776bf);
          box-shadow: 0 0 0 3px
            color-mix(in srgb, var(--c8y-brand-primary, #1776bf) 20%, transparent);
        }
      }

      .kpi-config__preview-svg {
        width: 96px;
        height: 110px;
        display: block;
        border-radius: 6px;
        border: 1px solid var(--c8y-root-component-border-color, #dfe4e8);
        color: var(--c8y-text-color, #1e2a33);
        background: var(--c8y-root-component-background-default, #fff);

        &--dark {
          border-color: #223244;
          background: #101a26;
        }
      }

      .kpi-config__variant-name {
        font-size: 12px;
        font-weight: 700;
        color: var(--c8y-text-color, #1e2a33);
        text-align: center;
      }

      .kpi-config__variant-desc {
        text-align: center;
        line-height: 1.4;
      }
    `,
  ],
})
export class KpiTrendWidgetConfigComponent implements OnInit {
  private readonly widgetConfigService = inject(WidgetConfigService);
  private readonly current = toSignal(this.widgetConfigService.currentConfig$, {
    initialValue: this.widgetConfigService.currentConfig,
  });

  /** `assignedCurrentConfig$` is the only way to the second object `save()` spreads, see `flush`. */
  private readonly assigned = toSignal<ContextWidgetConfig | null>(
    this.widgetConfigService.assignedCurrentConfig$,
    { initialValue: null }
  );

  /** The keys this section owns, as edited. Mutated in place by the template's ngModel bindings. */
  protected config: AppearanceConfig = {};
  /** Snapshot of `config` taken on every edit, so the preview follows the form immediately. */
  private readonly edited = signal<AppearanceConfig>({});

  /**
   * The selected data point's own color, which the widget draws with while no accent is picked.
   * The swatch shows it, so it starts at the color the card actually has; picking a color stores
   * an override, and Reset returns to this one. Follows a data point change in the other section.
   */
  protected readonly datapointColor = computed(() => {
    const datapoints = (this.current() as KpiTrendWidgetConfig | null)?.datapoints;
    return (datapoints?.find((dp) => dp.__active) ?? datapoints?.[0])?.color;
  });

  /**
   * What the preview renders: the shared config (data point included, as the Data point section
   * left it) with this section's edits on top. `currentConfig$` lags 300 ms behind `updateConfig`,
   * so the edits are layered on locally rather than waited for.
   */
  protected readonly previewConfig = computed<KpiTrendWidgetConfig>(() => ({
    ...(this.current() as KpiTrendWidgetConfig | null),
    ...this.edited(),
  }));

  /** A config section replaces the platform's own preview, so it hands one over via setPreview. */
  @ViewChild('widgetPreview')
  set previewTemplate(template: TemplateRef<unknown> | undefined) {
    this.widgetConfigService.setPreview(template ?? NO_PREVIEW);
  }

  constructor() {
    let alive = true;

    inject(DestroyRef).onDestroy(() => {
      alive = false;
      this.widgetConfigService.setPreview(NO_PREVIEW);
    });
    // `updateConfig` is debounced by 300 ms; an edit just before Save would otherwise be lost.
    this.widgetConfigService.addOnBeforeSave(() => {
      if (alive) this.flush();

      return true;
    });
  }

  ngOnInit(): void {
    const stored = (this.widgetConfigService.currentConfig ?? {}) as KpiTrendWidgetConfig;

    this.config = {
      icon: stored.icon ?? 'line-chart',
      variant: stored.variant ?? DEFAULT_VARIANT,
      // A copy: the template edits it in place, and the stored object must not change before Save.
      trendWindow: { ...(stored.trendWindow ?? DEFAULT_TREND_WINDOW) },
      trendPointCount: stored.trendPointCount ?? DEFAULT_TREND_POINT_COUNT,
      higherIsBetter: stored.higherIsBetter ?? true,
      min: stored.min,
      max: stored.max,
      color: stored.color,
    };
    this.persistConfig();
  }

  /**
   * Pushes this section's keys onto the widget's shared config (see class doc). Only its own keys:
   * `updateConfig` merges every call of the session, last writer wins per key, so sending the whole
   * config would write back the `datapoints` read at init over the Data point section's later edits.
   */
  protected persistConfig(): void {
    const own: AppearanceConfig = { ...this.config, trendWindow: { ...this.config.trendWindow! } };

    this.edited.set(own);
    this.widgetConfigService.updateConfig(own);
  }

  /** Writes the edits into both objects `save()` composes, ahead of the debounce. */
  private flush(): void {
    const own = this.edited();

    for (const config of [this.widgetConfigService.currentConfig, this.assigned()]) {
      if (config) Object.assign(config, own);
    }
  }

  /** Clears the accent override, so the widget and the swatch return to the data point's color. */
  protected resetColor(): void {
    this.config.color = undefined;
    this.persistConfig();
  }
}
