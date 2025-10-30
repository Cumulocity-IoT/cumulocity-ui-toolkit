import { inject, Injectable } from '@angular/core';
import { IUserCustomerProperties } from './favorites-manager.model';
import { isEmpty } from 'lodash';
import { DataSourceModifier, ServerSideDataResult } from '@c8y/ngx-components';
import { InventoryDatasourceService } from '../services/inventory-datasource.service';
import { UserService } from '@c8y/client';

@Injectable()
export class FavoritesManagerService {
  serverSideDataCallback: Promise<ServerSideDataResult>;

  private BASE_QUERY = {
    __and: [],
  };

  private userService = inject(UserService);

  private inventoryDatasource = inject(InventoryDatasourceService);

  async initFavorites(): Promise<void> {
    const favorites = await this.getFavoritesForCurrentUser();

    if (!favorites || favorites.length === 0) {
      return;
    }

    this.BASE_QUERY.__and.push({
      __or: favorites.map((favorite) => {
        return { __eq: { id: favorite } };
      }),
    });

    this.serverSideDataCallback = this.onDataSourceModifier.bind(this);
  }

  async onDataSourceModifier(
    dataSourceModifier: DataSourceModifier
  ): Promise<ServerSideDataResult> {
    return this.inventoryDatasource.reload(dataSourceModifier, this.BASE_QUERY);
  }

  async getFavoriteStatus(managedObjectId: string): Promise<boolean> {
    try {
      const favorites = await this.getFavoritesForCurrentUser();

      if (isEmpty(favorites)) {
        return false;
      }

      return favorites.findIndex((favorite) => favorite === managedObjectId) !== -1;
    } catch (error) {
      console.error('Failed to get favorite status: ', error);
    }
  }

  async addToFavorites(managedObjectId: string): Promise<void> {
    try {
      const user = (await this.userService.current()).data;
      const customProperties = user.customProperties as IUserCustomerProperties;

      if (!customProperties.favorites) {
        customProperties.favorites = [];
      }

      customProperties.favorites.push(managedObjectId);

      await this.userService.updateCurrent(user);
    } catch (error) {
      console.error('Failed to add object to favorites: ', error);
    }
  }

  async removeFromFavorites(managedObjectId: string): Promise<void> {
    try {
      const user = (await this.userService.current()).data;
      const customProperties = user.customProperties as IUserCustomerProperties;

      if (isEmpty(customProperties.favorites)) {
        return;
      }

      customProperties.favorites.splice(
        customProperties.favorites.findIndex((favoriteId) => favoriteId === managedObjectId),
        1
      );

      await this.userService.updateCurrent(user);
    } catch (error) {
      console.error('Failed to add object to favorites: ', error);
    }
  }

  private async getFavoritesForCurrentUser(): Promise<string[]> {
    try {
      const user = (await this.userService.current()).data;
      const customProperties = user.customProperties as IUserCustomerProperties;

      if (!customProperties || !customProperties.favorites) {
        return undefined;
      }

      return customProperties.favorites;
    } catch (error) {
      console.error('Failed to load favorites for current user: ', error);

      return undefined;
    }
  }
}
