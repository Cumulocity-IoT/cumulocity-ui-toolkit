import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import {
  ENERGY_CONSUMPTION_WIDGET__DATE_RANGE,
  ENERGY_CONSUMPTION_WIDGET__DISPLAY_CONFIG_OPTIONS,
  ENERGY_CONSUMPTION_WIDGET__RANGE_TYPE_OPTIONS,
} from '../../models/energy-consumption-widget.const';
import {
  EnergyConsumptionWidgetConfig,
  EnergyWidgetDateDisplayMode,
  EnergyWidgetDateRange,
  EnergyWidgetRangeType,
} from '../../models/energy-consumption-widget.model';

@Component({
  selector: 'c8y-energy-consumption-widget-config',
  template: '<formly-form [form]="form" [fields]="fields" [model]="config"></formly-form>',
  styleUrl: './energy-consumption-widget-config.component.scss',
})
export class EnergyConsumptionWidgetConfigComponent {
  @Input() config!: EnergyConsumptionWidgetConfig;

  form = new FormGroup({});

  // TODO add configs for: start of week, color
  fields: FormlyFieldConfig[] = [
    {
      fieldGroup: [
        {
          key: 'rangeType',
          type: 'select',
          className: 'col-sm-12',
          defaultValue: EnergyWidgetRangeType.DATE,
          props: {
            label: 'Range Type',
            required: true,
            options: ENERGY_CONSUMPTION_WIDGET__RANGE_TYPE_OPTIONS,
          },
        },
        // date
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'displayMode',
              type: 'select',
              className: 'col-sm-6',
              defaultValue: EnergyWidgetDateDisplayMode.TOTAL,
              props: {
                label: 'Display Mode',
                required: true,
                options: ENERGY_CONSUMPTION_WIDGET__DISPLAY_CONFIG_OPTIONS,
              },
            },
            {
              key: 'defaultRange',
              type: 'select',
              className: 'col-sm-6',
              defaultValue: EnergyWidgetDateRange.YEAR,
              props: {
                label: 'Default Range',
                required: true,
                options: ENERGY_CONSUMPTION_WIDGET__DATE_RANGE,
              },
            },
          ],
        },
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'fragment',
              type: 'input',
              className: 'col-sm-6',
              props: {
                label: 'Fragment',
                required: true,
              },
            },
            {
              key: 'series',
              type: 'input',
              className: 'col-sm-6',
              props: {
                label: 'Series',
                required: true,
              },
            },
          ],
        },
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'digits',
              type: 'number',
              className: 'col-sm-6',
              defaultValue: 2,
              props: {
                label: 'Rounding Digits',
                required: true,
              },
            },
            {
              key: 'beginAtZero',
              type: 'checkbox',
              className: 'col-cm-6 checkbox-field',
              hideExpression: (model) => model.displayMode !== 'total',
              defaultValue: true,
              props: {
                label: 'Begin Scale at Zero',
              },
            },
          ],
        },
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'eventType',
              type: 'input',
              className: 'col-sm-6',
              hideExpression: (model) => model.rangeType !== 'event',
              props: {
                label: 'Event Type',
                required: true,
              },
            },
          ],
        },
      ],
    },
  ];
}
