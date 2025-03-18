import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { hookTab } from '@c8y/ngx-components';
import { TranslateModule } from '@ngx-translate/core';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { CustomTabFactory } from './tab.factory';

@NgModule({
  imports: [CommonModule, BsDropdownModule, TranslateModule],
  providers: [hookTab(CustomTabFactory)],
  declarations: [],
})
export class C8yFactoriesModule {}
