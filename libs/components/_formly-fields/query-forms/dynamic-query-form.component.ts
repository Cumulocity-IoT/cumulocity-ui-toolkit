import { AfterViewInit, Component, inject, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { C8yJSONSchema, CoreModule } from '@c8y/ngx-components';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { JSONSchema7 } from 'json-schema';
import { set } from 'lodash';

@Component({
  selector: 'ps-dynamic-query-form',
  standalone: true,
  imports: [CoreModule],
  template: `<form class="card" [formGroup]="form">
    <div class="card-header">
      <h4 class="card-title">Query filter</h4>
    </div>
    <div class="card-block">
      <button
        class="btn btn-default btn-icon btn-sm m-t-8 m-l-0 m-r-8"
        *ngFor="let p of params"
        [ngClass]="selectedFilters.includes(p) ? 'active' : ''"
        (click)="queryParamClick(p)"
      >
        <i [c8yIcon]="getIcon(p)"></i>
        {{ p.title }}
      </button>

      <div class="form-group m-t-16">
        <formly-form [form]="form" [fields]="fields" [model]="filter"></formly-form>
      </div>
    </div>
  </form>`,
})
export class DynamicQueryFormComponent implements AfterViewInit {
  private jsonschema = inject(C8yJSONSchema);

  @Input() filter: any = {};
  @Input() params: any[] = [];

  queryFormJSON: JSONSchema7 = {
    $schema: 'https://json-schema.org/draft/2019-09/schema',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  };

  selectedFilters: { title: string }[] = [];
  form = new FormGroup({});
  fields: FormlyFieldConfig[] = [];

  ngAfterViewInit(): void {
    for (const title of Object.keys(this.filter)) {
      const match = this.params.find((p) => p.title === title);

      if (match) {
        this.selectedFilters.push(match);
        set((<any>this.queryFormJSON).properties, match.title, match);
      }
    }
    this.reloadForm();
  }

  getIcon(b: { type: string; enum?: [] }) {
    if (b.type === 'date') {
      return 'calendar-1';
    } else if (b.type === 'boolean') {
      return 'radio-button-on';
    } else if (b.type === 'string') {
      if (b.enum) {
        return 'radio-button-on';
      } else {
        return 'text-input';
      }
    }

    return '';
  }

  queryParamClick(b: { title: string }) {
    const properties = (<any>this.queryFormJSON).properties;

    if (this.selectedFilters.includes(b)) {
      this.selectedFilters = this.selectedFilters.filter((f) => f !== b);
      delete properties[b.title];
      delete this.filter[b.title];
    } else {
      set((<any>this.queryFormJSON).properties, b.title, b);
      this.selectedFilters.push(b);
    }
    this.reloadForm();
  }

  private reloadForm() {
    this.fields = [
      this.jsonschema.toFieldConfig(this.queryFormJSON, {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        map(mappedField: FormlyFieldConfig, _mapSource: JSONSchema7) {
          return mappedField;
        },
      }),
    ];
  }
}
