import { Component, Input, OnInit } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { KPIDetails } from '@c8y/ngx-components/datapoint-selector';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { has } from 'lodash';
import { AdvancedRadialGaugeConfig } from '../../models/advanced-radial-gauge.model';

@Component({
  selector: 'c8y-advanced-radial-gauge-config-component',
  template: '<formly-form [form]="form" [fields]="fields" [model]="config"></formly-form>',
  standalone: false,
})
export class AdvancedRadialGaugeWidgetConfig implements OnInit {
  @Input() config!: AdvancedRadialGaugeConfig;

  datapoints?: KPIDetails[];
  form = new FormGroup({});
  fields: FormlyFieldConfig[] = [
    // datapoint
    {
      fieldGroup: [
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'datapoint.fragment',
              type: 'string',
              className: 'col-md-6',
              props: {
                label: 'Fragment',
                required: true,
              },
            },
            {
              key: 'datapoint.series',
              type: 'string',
              className: 'col-md-6',
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
              key: 'datapoint.label',
              type: 'string',
              className: 'col-md-6',
              props: {
                label: 'Label',
              },
            },
            {
              key: 'datapoint.unit',
              type: 'string',
              className: 'col-md-6',
              props: {
                label: 'Unit',
              },
            },
          ],
        },
      ],
    },
    // range
    {
      fieldGroup: [
        {
          template: '<hr />',
        },
        // min & max
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'datapoint.min',
              type: 'number',
              className: 'col-md-6',
              props: {
                label: 'Range Min',
                step: 1,
              },
              validators: {
                'datapoint.max': {
                  expression: (c: AbstractControl) => this.validateLowerThan(c, 'max'),
                  message: 'Range Min value must be lower than the Range Max',
                },
              },
            },
            {
              key: 'datapoint.max',
              type: 'number',
              className: 'col-md-6',
              props: {
                label: 'Range Max',
                step: 1,
              },
              validators: {
                'datapoint.min': {
                  expression: (c: AbstractControl) => this.validateHigherThan(c, 'min'),
                  message: 'Range Max value must be higher than the Range Min',
                },
              },
            },
          ],
        },
        // yellow and red range
        {
          fieldGroupClassName: 'row',
          fieldGroup: [
            {
              key: 'datapoint.yellowRangeMin',
              type: 'number',
              className: 'col-md-6',
              props: {
                label: '🟠 Orange Range Start',
                step: 1,
              },
              validators: {
                'datapoint.min': {
                  expression: (c: AbstractControl) => this.validateHigherThan(c, 'min'),
                  message: 'Range value must be higher than the Range Min',
                },
                'datapoint.max': {
                  expression: (c: AbstractControl) => this.validateLowerThan(c, 'max'),
                  message: 'Range value must be lower than the Range Max',
                },
                'datapoint.redRangeMin': {
                  expression: (c: AbstractControl) => this.validateHigherThan(c, 'redRangeMin'),
                  message: 'Range value must be lower than the Red Range Start',
                },
              },
            },
            {
              key: 'datapoint.redRangeMin',
              type: 'number',
              className: 'col-md-6',
              props: {
                label: '🔴 Red Range Start',
                step: 1,
              },
              validators: {
                'datapoint.min': {
                  expression: (c: AbstractControl) => this.validateHigherThan(c, 'min'),
                  message: 'Range value must be higher than the Range Min',
                },
                'datapoint.max': {
                  expression: (c: AbstractControl) => this.validateLowerThan(c, 'max'),
                  message: 'Range value must be lower than the Range Max',
                },
                'datapoint.yellowRangeMin': {
                  expression: (c: AbstractControl) => this.validateHigherThan(c, 'yellowRangeMin'),
                  message: 'Range value must be higher than the Yellow Range Start',
                },
              },
            },
          ],
        },
      ],
    },
    // chart config
    {
      fieldGroup: [
        {
          template: '<hr />',
        },
      ],
    },
  ];

  private isDev = false;

  constructor() {
    this.isDev = window.location.search.indexOf('dev=true') >= 0;
  }

  ngOnInit(): void {
    // eslint-disable-next-line no-console
    if (this.isDev) console.log('config init', this.config);
  }

  private validateHigherThan(control: AbstractControl, dataPointKey: string): boolean {
    return has(this.config?.datapoint, dataPointKey)
      ? control.value > this.config?.datapoint?.[dataPointKey]
      : true;
  }

  private validateLowerThan(control: AbstractControl, dataPointKey: string): boolean {
    return has(this.config?.datapoint, dataPointKey)
      ? control.value < this.config?.datapoint?.[dataPointKey]
      : true;
  }
}
