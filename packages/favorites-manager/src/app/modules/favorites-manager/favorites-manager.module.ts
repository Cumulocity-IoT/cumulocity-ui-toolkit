import { NgModule } from '@angular/core';
import { FavoritesManagerComponent } from './favorites-manager.component';
import { CoreModule, hookActionBar, hookNavigator, hookRoute } from '@c8y/ngx-components';
import { FavoritesManagerNavigationFactory } from './favorites-manager.factory';
import { FavoritesActionComponent } from './favorites-action.component';
import { FavoritesActionFactory } from './favorites-action.factory';
import { StatusExtendedCellRendererComponent } from './columns/status-extended.cell-renderer.component';
import { ObjectTypeCellRendererComponent } from './columns/object-type.cell-renderer.component';
import { TypeCellRendererComponent } from './columns/type.cell-renderer.component';

@NgModule({
  imports: [CoreModule],
  exports: [FavoritesManagerComponent, FavoritesActionComponent],
  declarations: [
    FavoritesManagerComponent,
    FavoritesActionComponent,
    ObjectTypeCellRendererComponent,
    StatusExtendedCellRendererComponent,
    TypeCellRendererComponent,
  ],
  providers: [
    hookNavigator(FavoritesManagerNavigationFactory),
    hookRoute({
      path: 'favorites',
      component: FavoritesManagerComponent,
    }),
    hookActionBar(FavoritesActionFactory),
  ],
})
export class FavoritesManagerModule {}
