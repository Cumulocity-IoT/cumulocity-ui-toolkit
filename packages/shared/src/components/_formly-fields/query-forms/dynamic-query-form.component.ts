import { AfterViewInit, Component, input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { C8yJSONSchema, CoreModule } from '@c8y/ngx-components';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';
import { JSONSchema7 } from 'json-schema';
import { set } from 'lodash';
import { getDateFromBlock, getDateToBlock } from './formly-query-blocks';
import { QueryBuilderFormComponent } from './query-builder-form.component';

/**
 * A selectable query parameter. Note that `type` is intentionally a free-form
 * string (e.g. `'date'`) rather than a `JSONSchema7TypeName`, since these
 * descriptors drive the query-form UI, not strict JSON-Schema validation.
 */
export interface QueryParam {
  title: string;
  type: string;
  description?: string;
  enum?: string[];
  examples?: string[];
  /**
   * Inline formly validators keyed by name. Each entry must have an `expression`
   * that returns `true` when valid and a `message` shown on failure.
   */
  validators?: Record<
    string,
    {
      expression: (
        control: import('@angular/forms').AbstractControl,
        field: FormlyFieldConfig
      ) => boolean;
      message: string | ((error: unknown, field: FormlyFieldConfig) => string);
    }
  >;
}

@Component({
  selector: 'ps-dynamic-query-form',
  standalone: true,
  imports: [CoreModule, FormlyModule, QueryBuilderFormComponent],
  template: `<form class="card" [formGroup]="form">
    <div class="card-header">
      <h4 class="card-title">Query filter</h4>
    </div>
    <div class="card-block">
      @for (p of params(); track p) {
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
        <formly-form [form]="form" [fields]="fields" [model]="filter()"></formly-form>
      </div>

      @for (p of queryBuilderFilters; track p.title) {
        <div class="m-t-8">
          <ps-query-builder-form [filter]="filter()" [filterKey]="p.title"></ps-query-builder-form>
        </div>
      }
    </div>
  </form>`,
})
export class DynamicQueryFormComponent implements AfterViewInit {
  selectedFilters: QueryParam[] = [];

  queryFormJSON: JSONSchema7 = {
    $schema: 'https://json-schema.org/draft/2019-09/schema',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  };

  form = new FormGroup({});
  fields: FormlyFieldConfig[] = [];
  filter = input<Record<string, unknown>>({});
  params = input<QueryParam[]>([]);

  constructor(private jsonschema: C8yJSONSchema) {}

  ngAfterViewInit(): void {
    const properties = this.queryFormJSON.properties as Record<string, JSONSchema7>;

    for (const title of Object.keys(this.filter())) {
      const match = this.params().find((p) => p.title === title);

      if (match) {
        this.selectedFilters.push(match);

        if (match.type !== 'date' && match.type !== 'query-builder') {
          set(properties, match.title, match);
        }
      }
    }
    this.reloadForm();
  }

  get queryBuilderFilters(): QueryParam[] {
    return this.selectedFilters.filter((p) => p.type === 'query-builder');
  }

  getIcon(b: QueryParam) {
    if (b.type === 'date') {
      return 'calendar-1';
    } else if (b.type === 'query-builder') {
      return 'filter';
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

  queryParamClick(b: QueryParam) {
    const properties = this.queryFormJSON.properties as Record<string, JSONSchema7>;

    if (this.selectedFilters.includes(b)) {
      this.selectedFilters = this.selectedFilters.filter((f) => f !== b);

      if (b.type !== 'date' && b.type !== 'query-builder') {
        delete properties[b.title];
      }
      delete this.filter()[b.title];
    } else {
      if (b.type !== 'date' && b.type !== 'query-builder') {
        set(properties, b.title, b);
      }
      this.selectedFilters.push(b);
    }
    this.reloadForm();
  }

  private reloadForm() {
    const paramsByTitle = new Map(this.params().map((p) => [p.title, p]));

    const dateFields: FormlyFieldConfig[] = this.selectedFilters
      .filter((p) => p.type === 'date')
      .map((p) => {
        const isFrom = p.title.toLowerCase().endsWith('from');
        return isFrom
          ? getDateFromBlock({ key: p.title, label: p.title, description: p.description ?? '' })
          : getDateToBlock({ key: p.title, label: p.title, description: p.description ?? '' });
      });

    const schemaField = this.jsonschema.toFieldConfig(this.queryFormJSON, {
      map(mappedField: FormlyFieldConfig, _mapSource: JSONSchema7) {
        const param = paramsByTitle.get(String(mappedField.key ?? ''));

        if (param?.validators) {
          mappedField.validators = { ...mappedField.validators, ...param.validators };
        }

        return mappedField;
      },
    });

    schemaField.fieldGroup = [...dateFields, ...(schemaField.fieldGroup ?? [])];
    this.fields = [schemaField];
  }
}
