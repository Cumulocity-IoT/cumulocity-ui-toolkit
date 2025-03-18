import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CoreModule } from '@c8y/ngx-components';
import { TooltipModule } from 'ngx-bootstrap/tooltip';

@NgModule({
  imports: [CommonModule, CoreModule, RouterModule, FormsModule, TooltipModule],
  declarations: [],
  providers: [],
})
export class AdvancedSimulatorPluginModule {}
