import { AfterViewInit, Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { C8yJSONSchema } from '@c8y/ngx-components';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { JSONSchema7 } from 'json-schema';
import { set } from 'lodash';

@Component({
  selector: 'dynamic-query-form',
  template: `<form class="card" [formGroup]="form">
    <div class="card-header">
      <h4 class="card-title">Query filter</h4>
    </div>
    <div class="card-block">
      @for (p of params; track p) {
        <button
          class="btn btn-default btn-icon btn-sm m-t-8 m-l-0 m-r-8"
          [ngClass]="selectedFilters.includes(p) ? 'active' : ''"
          (click)="queryParamClick(p)"
        >
          <i [c8yIcon]="getIcon(p)"></i>
          {{ p.title }}
        </button>
      }

      <div class="form-group m-t-16">
        <formly-form [form]="form" [fields]="fields" [model]="filter"></formly-form>
      </div>
    </div>
  </form>`,
  standalone: false,
})
export class DynamicQueryFormComponent implements AfterViewInit {
  selectedFilters: (JSONSchema7 & { title: string })[] = [];

  queryFormJSON: JSONSchema7 = {
    $schema: 'https://json-schema.org/draft/2019-09/schema',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  };

  form = new FormGroup({});
  fields: FormlyFieldConfig[] = [];
  @Input() filter: Record<string, unknown> = {};
  @Input() params: (JSONSchema7 & { title: string })[] = [];

  constructor(private jsonschema: C8yJSONSchema) {}

  ngAfterViewInit(): void {
    for (const title of Object.keys(this.filter)) {
      const match = this.params.find((p) => p.title === title);

      if (match) {
        this.selectedFilters.push(match);
        set(this.queryFormJSON.properties as object, match.title, match);
      }
    }
    this.reloadForm();
  }

  getIcon(b: JSONSchema7 & { title: string }) {
    const type = (Array.isArray(b.type) ? b.type[0] : b.type) as string;

    if (type === 'date') {
      return 'calendar-1';
    } else if (type === 'boolean') {
      return 'radio-button-on';
    } else if (type === 'string') {
      if (b.enum) {
        return 'radio-button-on';
      } else {
        return 'text-input';
      }
    }

    return '';
  }

  queryParamClick(b: JSONSchema7 & { title: string }) {
    const properties = this.queryFormJSON.properties;

    if (this.selectedFilters.includes(b)) {
      this.selectedFilters = this.selectedFilters.filter((f) => f !== b);

      if (properties) {
        delete properties[b.title];
      }
      delete this.filter[b.title];
    } else {
      set(this.queryFormJSON.properties as object, b.title, b);
      this.selectedFilters.push(b);
    }
    this.reloadForm();
  }

  private reloadForm() {
    this.fields = [
      this.jsonschema.toFieldConfig(this.queryFormJSON, {
        map(mappedField: FormlyFieldConfig, _mapSource: JSONSchema7) {
          return mappedField;
        },
      }),
    ];
  }
}
