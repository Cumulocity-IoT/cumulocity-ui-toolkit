import { Component } from '@angular/core';
import { AssetSelectorModule } from '@c8y/ngx-components/assets-navigator';
import { FieldType, FieldTypeConfig, FormlyModule } from '@ngx-formly/core';

@Component({
  selector: 'formly-asset',
  templateUrl: './asset.formly.component.html',
  styleUrl: './asset.formly.component.less',
  standalone: true,
  imports: [AssetSelectorModule, FormlyModule],
})
export class AssetFieldType extends FieldType<FieldTypeConfig> {}
