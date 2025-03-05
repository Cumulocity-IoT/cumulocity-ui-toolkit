import { Component, Input, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { OptionsService } from '@c8y/ngx-components';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { cloneDeep, has } from 'lodash';
import {
  KPI_AGGREGAOR_WIDGET_ORDER_OPTIONS,
  KPI_AGGREGAOR_WIDGET__CHART_LEGEND_POSITION_OPTIONS,
  KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG,
  KPI_AGGREGAOR_WIDGET__DISPLAY_OPTIONS,
  KPI_AGGREGAOR_WIDGET__SORT_OPTIONS,
} from '../../models/kpi-aggregator-widget.const';
import { KpiAggregatorWidgetConfig } from '../../models/kpi-aggregator-widget.model';

@Component({
  selector: 'c8y-kpi-aggregator-widget-config',
  template:
    '<formly-form [form]="form" [fields]="fields" [model]="config"></formly-form>',
  styleUrl: 'kpi-aggregator-widget-config.component.less',
})
export class KpiAggregatorWidgetConfigComponent implements OnInit {
  @Input() config!: KpiAggregatorWidgetConfig;

  set opacity(opacity: number) {
    this.config.opacity = opacity / 100;
  }
  get opacity(): number {
    return this.config.opacity * 100;
  }

  form = new FormGroup({});

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
            description:
              'If active, starts to query on page load. Otherwise triggered manually.',
          },
        },
      ],
    },
  ];

  private defaultConfig = cloneDeep(KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG);

  constructor(private optionsService: OptionsService) {}

  ngOnInit(): void {
    this.setTenantConfigs();
    this.setDefaultValues();
  }

  private setTenantConfigs() {
    // override default with branding
    if (has(this.optionsService.brandingCssVars, 'brand-primary')) {
      this.defaultConfig.color = this.optionsService.brandingCssVars[
        'brand-primary'
      ] as string;
    }
  }

  private setDefaultValues() {
    // make sure alle defaults are present, eg after updates
    const keys = Object.keys(this.defaultConfig);

    keys.forEach((key) => {
      if (
        !this.config[key] &&
        typeof this.config[key] !== 'boolean' &&
        this.config[key] !== 0
      ) {
        this.config[key] = this.defaultConfig[key];
      }
    });
  }
}
