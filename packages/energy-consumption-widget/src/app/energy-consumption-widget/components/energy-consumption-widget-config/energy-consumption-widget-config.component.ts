import { Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import {
  ENERGY_CONSUMPTION_WIDGET__DATE_RANGE,
  ENERGY_CONSUMPTION_WIDGET__DEFAULT_DATE_RANGE,
  ENERGY_CONSUMPTION_WIDGET__DISPLAY_CONFIG_OPTIONS,
  ENERGY_CONSUMPTION_WIDGET__RANGE_TYPE_OPTIONS,
} from '../../models/energy-consumption-widget.const';
import {
  EnergyConsumptionWidgetConfig,
  EnergyWidgetDateDisplayMode,
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
        // event
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'eventType',
              type: 'input',
              className: 'col-sm-12',
              hideExpression: (model: EnergyConsumptionWidgetConfig) => model.rangeType !== 'event',
              props: {
                label: 'Event Type',
                required: true,
              },
            },
          ],
        },
        // date
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'displayMode',
              type: 'select',
              className: 'col-sm-4',
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
              className: 'col-sm-4',
              defaultValue: ENERGY_CONSUMPTION_WIDGET__DEFAULT_DATE_RANGE,
              props: {
                label: 'Default Range',
                required: true,
                options: ENERGY_CONSUMPTION_WIDGET__DATE_RANGE,
              },
            },
            {
              key: 'exposeRangeSelect',
              type: 'checkbox',
              className: 'col-sm-4 checkbox-field',
              defaultValue: false,
              props: {
                label: 'Expose Range Select',
              },
            },
          ],
        },
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'type',
              type: 'input',
              className: 'col-sm-4',
              props: {
                label: 'Measurement Type',
                required: true,
              },
            },
            {
              key: 'fragment',
              type: 'input',
              className: 'col-sm-4',
              props: {
                label: 'Fragment',
                required: true,
              },
            },
            {
              key: 'series',
              type: 'input',
              className: 'col-sm-4',
              props: {
                label: 'Series',
                required: false,
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
              className: 'col-sm-6 checkbox-field',
              hideExpression: (model: EnergyConsumptionWidgetConfig) =>
                model.displayMode !== 'total',
              defaultValue: true,
              props: {
                label: 'Begin Scale at Zero',
              },
            },
          ],
        },
      ],
    },
  ];
}
