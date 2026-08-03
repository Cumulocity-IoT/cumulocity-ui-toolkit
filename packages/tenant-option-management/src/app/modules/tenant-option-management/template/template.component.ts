import { Component } from '@angular/core';
import analyticsBuilderJson from './analytics-builder-example.json';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core';

@Component({
  selector: 'tenant-option-template',
  templateUrl: './template.component.html',
  standalone: true,
  imports: [ReactiveFormsModule, FormlyModule],
})
export class TemplateComponent {
  form = new FormGroup({});
  fields: FormlyFieldConfig[] = analyticsBuilderJson;
  model: object = {};
}
