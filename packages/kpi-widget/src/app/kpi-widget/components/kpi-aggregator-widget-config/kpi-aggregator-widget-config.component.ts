import {
  Component,
  DestroyRef,
  inject,
  Input,
  OnInit,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup } from '@angular/forms';
import { CoreModule, OptionsService } from '@c8y/ngx-components';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { cloneDeep } from 'lodash';
import { debounceTime, Subject } from 'rxjs';
import {
  KPI_AGGREGAOR_WIDGET__CHART_LEGEND_POSITION_OPTIONS,
  KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG,
  KPI_AGGREGAOR_WIDGET__DISPLAY_OPTIONS,
  KPI_AGGREGAOR_WIDGET__SORT_OPTIONS,
  KPI_AGGREGAOR_WIDGET_ORDER_OPTIONS,
} from '../../models/kpi-aggregator-widget.const';
import { KpiAggregatorWidgetConfig } from '../../models/kpi-aggregator-widget.model';
import { KpiAggregatorWidgetComponent } from '../kpi-aggregator-widget/kpi-aggregator-widget.component';
import { WidgetConfigService } from '@c8y/ngx-components/context-dashboard';

@Component({
  selector: 'c8y-kpi-aggregator-widget-config',
  templateUrl: './kpi-aggregator-widget-config.component.html',
  styleUrl: './kpi-aggregator-widget-config.component.less',
  standalone: true,
  imports: [CoreModule, FormlyModule, KpiAggregatorWidgetComponent],
})
export class KpiAggregatorWidgetConfigComponent implements OnInit {
  private readonly widgetConfigService = inject(WidgetConfigService);
  private readonly destroyRef = inject(DestroyRef);
  private optionsService = inject(OptionsService);
  private readonly previewUpdate$ = new Subject<void>();

  @ViewChild('widgetPreview')
  set previewMapSet(template: TemplateRef<unknown>) {
    if (template) {
      this.widgetConfigService.setPreview(template);

      return;
    }
    this.widgetConfigService.setPreview(null);
  }

  @Input() set config(config: KpiAggregatorWidgetConfig) {
    this._config = config;
    this.syncFormStateFromConfig();
  }

  get config(): KpiAggregatorWidgetConfig {
    return this._config;
  }

  form = new FormGroup({});
  formModel: KpiAggregatorWidgetConfig = cloneDeep(KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG);
  previewConfig: KpiAggregatorWidgetConfig = cloneDeep(KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG);
  previewRenderKey = 0;

  fields: FormlyFieldConfig[] = [
    {
      // 1. request
      fieldGroup: [
        {
          key: 'query',
          type: 'input',
          props: {
            label: 'Query',
            required: true,
            description:
              'Placeholders (<code>[foo]</code>) can be used to set query parameters based on the current dashboards context.<br>For example: <code>(kpi_Group.groupId eq [kpi_GroupId]).',
          },
        },
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'pageSize',
              type: 'number',
              className: 'col-md-4',
              props: {
                label: 'Page Size',
                required: true,
                min: 1,
                max: 2000,
                step: 250,
                description:
                  'The <b>number of items</b> you want to load per request.<br>The lower the number, the quicker the response.',
              },
            },
            {
              key: 'pageLimit',
              type: 'number',
              className: 'col-md-4',
              props: {
                label: 'Page Limit',
                min: 0,
                step: 1,
                description:
                  'The <b>maximal number of pages</b> you want to load initially.<br>Set it to <code>0</code>, to use the maximal supported number of pages.',
              },
            },
            {
              key: 'parallelRequests',
              type: 'number',
              className: 'col-md-4',
              props: {
                label: 'Number of parallel requests',
                min: 1,
                max: 10,
                step: 1,
                description:
                  'If you want to load pages in parallel, instead of one after another.<br>This can reduce the time for the overall process to finish, but might also stress the tenant.',
              },
            },
          ],
        },
      ],
    },
    {
      // 2. view
      fieldGroup: [
        {
          key: 'display',
          type: 'select',
          props: {
            label: 'Display Mode',
            required: true,
            options: KPI_AGGREGAOR_WIDGET__DISPLAY_OPTIONS,
          },
        },
        {
          template: '<hr />',
        },
        {
          key: 'kpiFragment',
          type: 'input',
          props: {
            label: 'KPI Fragment',
            required: true,
            description:
              'The inventory managed object fragment, that serves as the basis of the aggregation e.g. <code>c8y_ActiveAlarmsStatus.major</code>',
          },
          expressions: {
            hide: 'model.display == "list"',
          },
        },
        {
          key: 'groupBy',
          type: 'input',
          props: {
            label: 'Group by',
            placeholder: 'c8y_Hardware.model',
          },
          expressions: {
            hide: 'model.display == "list"',
          },
        },
        {
          key: 'label',
          type: 'input',
          props: {
            label: 'Label',
            placeholder: 'type',
            description:
              'The fragment of the inventory managed object that should be displayed in the output; e.g. <code>type</code>.',
          },
          expressions: {
            hide: 'model.display != "aggregate" && model.display != "pieAggregate"',
          },
        },
        {
          key: 'sort',
          type: 'select',
          props: {
            label: 'Sort',
            options: KPI_AGGREGAOR_WIDGET__SORT_OPTIONS,
          },
          expressions: {
            hide: 'model.display == "pieCount" || model.display == "pieAggregate"',
          },
        },
        {
          key: 'order',
          type: 'select',
          props: {
            label: 'Order',
            options: KPI_AGGREGAOR_WIDGET_ORDER_OPTIONS,
          },
          expressions: {
            hide: 'model.display == "pieCount" || model.display == "pieAggregate"',
          },
        },
      ],
    },
    {
      // 3. style
      expressions: {
        hide: 'model.display == "list"',
      },
      fieldGroup: [
        {
          key: 'chartLegendPosition',
          type: 'select',
          props: {
            label: 'Chart Legend Position',
            options: KPI_AGGREGAOR_WIDGET__CHART_LEGEND_POSITION_OPTIONS,
          },
          expressions: {
            hide: 'model.display != "pieCount" && model.display != "pieAggregate"',
          },
        },
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'color',
              type: 'input',
              className: 'col-md-9',
              props: {
                label: 'Background Color',
                type: 'color',
                description:
                  'Color as Hex, e.g. <code>#FF0000</code>.<br>By default the primary brand theme color will be used.',
              },
              expressions: {
                hide: 'model.display == "pieCount" || model.display == "pieAggregate"',
              },
            },
            {
              key: 'opacity',
              type: 'number',
              className: 'col-md-3',
              props: {
                label: 'Background Opacity',
                min: 0,
                max: 100,
                step: 10,
                addonRight: {
                  text: '%',
                },
                description:
                  'The opacity of the item background color in percent. <code>10</code>% means the item item chart background will be mostly tanslucent.',
              },
              expressions: {
                hide: 'model.display == "pieCount" || model.display == "pieAggregate"',
              },
            },
          ],
        },
      ],
    },
    {
      // 4. misc
      fieldGroup: [
        {
          template: '<hr />',
        },
        {
          key: 'percent',
          type: 'checkbox',
          props: {
            label: 'Show Percent',
          },
          expressions: {
            hide: 'model.display == "list"',
          },
        },
        {
          key: 'showMeta',
          type: 'checkbox',
          props: {
            label: 'Show Meta Info',
            description: 'Dispalys query duration and paging information.',
          },
        },
        {
          key: 'runOnLoad',
          type: 'checkbox',
          props: {
            label: 'Run on Load',
            description: 'If active, starts to query on page load. Otherwise triggered manually.',
          },
        },
      ],
    },
  ];

  private defaultConfig = cloneDeep(KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG);
  private _config!: KpiAggregatorWidgetConfig;

  ngOnInit(): void {
    this.previewUpdate$
      .pipe(debounceTime(1000), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this._config) {
          return;
        }

        this.previewConfig = cloneDeep(this._config);
        this.previewRenderKey += 1;
      });

    this.setTenantConfigs();
    this.syncFormStateFromConfig();
  }

  onModelChange(model: KpiAggregatorWidgetConfig): void {
    if (!this._config) {
      return;
    }

    this.formModel = this._config;

    if (model !== this._config) {
      Object.assign(this._config, model);
    }

    this.schedulePreviewRefresh();
  }

  private setTenantConfigs() {
    // override default with branding
    if (Object.hasOwn(this.optionsService.brandingCssVars, 'brand-primary')) {
      this.defaultConfig.color = this.optionsService.brandingCssVars['brand-primary'];
    }
  }

  private syncFormStateFromConfig(): void {
    if (!this._config) {
      return;
    }

    // Keep defaults and current input in sync while preserving the input object reference.
    const mergedConfig: KpiAggregatorWidgetConfig = {
      ...this.defaultConfig,
      ...this._config,
    };

    Object.assign(this._config, mergedConfig);
    this.formModel = this._config;
    this.schedulePreviewRefresh();
  }

  private schedulePreviewRefresh(): void {
    this.previewUpdate$.next();
  }
}
