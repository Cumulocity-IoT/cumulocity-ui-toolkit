import { Component } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';

@Component({
  selector: 'formly-asset',
  templateUrl: './asset.formly.component.html',
  styleUrl: './asset.formly.component.less',
})
export class AssetFieldType extends FieldType<FieldTypeConfig> {}
