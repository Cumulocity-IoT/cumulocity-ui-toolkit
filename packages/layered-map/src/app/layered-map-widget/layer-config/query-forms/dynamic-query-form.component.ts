import { AfterViewInit, Component, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { CoreModule } from '@c8y/ngx-components';
import { FormlyFieldConfig } from '@ngx-formly/core';

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
        [ngClass]="selectedFilters.includes(p.key!.toString()) ? 'active' : ''"
        (click)="queryParamClick(p.key!.toString())"
      >
        <i [c8yIcon]="getIcon(p)"></i>
        {{ p.key }}
      </button>

      <div class="form-group m-t-16">
        <formly-form [form]="form" [fields]="fields" [model]="filter"></formly-form>
      </div>

      <ng-content></ng-content>
    </div>
  </form>`,
})
export class DynamicQueryFormComponent implements AfterViewInit {
  selectedFilters: string[] = [];
  form = new FormGroup({});
  fields: FormlyFieldConfig[] = [];
  @Input() filter: Record<string, any> = {};
  @Input() params: FormlyFieldConfig[] = [];

  constructor() {}

  ngAfterViewInit(): void {
    const fields: FormlyFieldConfig[] = [];

    for (const title of Object.keys(this.filter)) {
      const match = this.params.find((p) => p.key === title);

      if (match) {
        this.selectedFilters.push(match.key.toString());
        fields.push(match);
      }
    }
    this.fields = fields;
  }

  getIcon(b: FormlyFieldConfig) {
    const key = b.key?.toString();

    if (key?.includes('date') || key?.includes('created')) {
      return 'calendar-1';
    }

    if (b.type == 'select' || b.type == 'checkbox') {
      return 'radio-button-on';
    } else if (b.type === 'input') {
      return 'text-input';
    }
    // if (b.type === 'date') {
    //   return 'calendar-1';

    // }

    return '';
  }

  queryParamClick(key: string) {
    // const properties = <any>this.fields;
    if (this.selectedFilters.some((f) => f === key)) {
      this.selectedFilters = this.selectedFilters.filter((f) => f !== key);
      // delete properties[b.key!];
      delete this.filter[key];
      this.fields = this.fields.filter((f) => f.key !== key);
    } else {
      // set(<any>this.fields, b.key, b);
      const param = this.params.find((p) => p.key === key);

      if (param) {
        this.fields = [...this.fields, param];
        this.selectedFilters.push(key);
      }
    }
  }
}
