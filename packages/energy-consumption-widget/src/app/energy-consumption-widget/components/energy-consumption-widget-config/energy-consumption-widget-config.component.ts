import { Component, inject, Input, TemplateRef, ViewChild } from '@angular/core';
import { gettext } from '@c8y/ngx-components/gettext';
import { FormGroup } from '@angular/forms';
import { CoreModule } from '@c8y/ngx-components';
import { WidgetConfigService } from '@c8y/ngx-components/context-dashboard';
import { setWidgetPreview } from '~helpers/widget-preview.helper';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
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
import { EnergyConsumptionWidgetComponent } from '../energy-consumption-widget/energy-consumption-widget.component';

@Component({
  selector: 'c8y-energy-consumption-widget-config',
  templateUrl: './energy-consumption-widget-config.component.html',
  styleUrl: './energy-consumption-widget-config.component.scss',
  standalone: true,
  imports: [CoreModule, FormlyModule, EnergyConsumptionWidgetComponent],
})
export class EnergyConsumptionWidgetConfigComponent {
  private readonly widgetConfigService = inject(WidgetConfigService);

  @Input() config!: EnergyConsumptionWidgetConfig;

  @ViewChild('widgetPreview')
  set previewMapSet(template: TemplateRef<unknown>) {
    setWidgetPreview(this.widgetConfigService, template);
  }

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
            label: gettext('Range Type'),
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
                label: gettext('Event Type'),
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
                label: gettext('Display Mode'),
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
                label: gettext('Default Range'),
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
                label: gettext('Expose Range Select'),
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
                label: gettext('Measurement Type'),
                required: true,
              },
            },
            {
              key: 'fragment',
              type: 'input',
              className: 'col-sm-4',
              props: {
                label: gettext('Fragment'),
                required: true,
              },
            },
            {
              key: 'series',
              type: 'input',
              className: 'col-sm-4',
              props: {
                label: gettext('Series'),
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
              className: 'col-sm-4',
              defaultValue: 2,
              props: {
                label: gettext('Rounding Digits'),
                required: true,
              },
            },
            {
              key: 'barColor',
              type: 'input',
              className: 'col-sm-4',
              props: {
                label: gettext('Bar Color'),
                required: false,
                placeholder: gettext('#000000'),
                description: gettext('If empty "brand light" is used as a fallback"'),
              },
            },
            {
              key: 'beginAtZero',
              type: 'checkbox',
              className: 'col-sm-4 checkbox-field',
              hideExpression: (model: EnergyConsumptionWidgetConfig) =>
                model.displayMode !== 'total',
              defaultValue: true,
              props: {
                label: gettext('Begin Scale at Zero'),
              },
            },
          ],
        },
      ],
    },
  ];
}
