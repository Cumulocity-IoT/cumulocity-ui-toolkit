import { inject, Injectable } from '@angular/core';
import { IUserCustomerProperties } from './favorites-manager.model';
import { isEmpty } from 'lodash';
import { DataSourceModifier, ServerSideDataResult } from '@c8y/ngx-components';
import { InventoryDatasourceService } from '../services/inventory-datasource.service';
import { QueryFilter } from '../models/query-utils.model';
import { UserService } from '@c8y/client';

@Injectable()
export class FavoritesManagerService {
  // Assigned by initFavorites() before the grid binds it.
  serverSideDataCallback!: (modifier: DataSourceModifier) => Promise<ServerSideDataResult>;

  private BASE_QUERY: QueryFilter = {
    __and: [],
  };

  private userService = inject(UserService);

  private inventoryDatasource = inject(InventoryDatasourceService);

  private hasFavorites = false;

  async initFavorites(): Promise<void> {
    const favorites = await this.getFavoritesForCurrentUser();

    // Rebuilt rather than appended to, so repeated calls cannot accumulate
    // duplicate clauses.
    this.hasFavorites = favorites.length > 0;
    this.BASE_QUERY = {
      __and: this.hasFavorites
        ? [{ __or: favorites.map((favorite) => ({ __eq: { id: favorite } })) }]
        : [],
    };

    // Always assigned: the grid binds this callback, and without it an empty
    // favorites list leaves the grid without a data source at all.
    this.serverSideDataCallback = this.onDataSourceModifier.bind(this);
  }

  async onDataSourceModifier(
    dataSourceModifier: DataSourceModifier
  ): Promise<ServerSideDataResult> {
    // Without favorites the base query has no clauses, which would match every
    // managed object instead of none.
    if (!this.hasFavorites) {
      return { data: [], size: 0, filteredSize: 0 } as unknown as ServerSideDataResult;
    }

    return this.inventoryDatasource.reload(dataSourceModifier, this.BASE_QUERY);
  }

  async getFavoriteStatus(managedObjectId: string): Promise<boolean> {
    const favorites = await this.getFavoritesForCurrentUser();

    if (isEmpty(favorites)) {
      return false;
    }

    return favorites.includes(managedObjectId);
  }

  async addToFavorites(managedObjectId: string): Promise<void> {
    const user = (await this.userService.current()).data;
    const customProperties = (user.customProperties ?? {}) as IUserCustomerProperties;

    if (!customProperties.favorites) {
      customProperties.favorites = [];
    }

    if (customProperties.favorites.includes(managedObjectId)) {
      return;
    }

    customProperties.favorites.push(managedObjectId);
    user.customProperties = customProperties;

    await this.userService.updateCurrent(user);
  }

  async removeFromFavorites(managedObjectId: string): Promise<void> {
    const user = (await this.userService.current()).data;
    const customProperties = user.customProperties as IUserCustomerProperties | undefined;
    const favorites = customProperties?.favorites;

    if (!favorites?.length) {
      return;
    }

    const index = favorites.indexOf(managedObjectId);

    if (index === -1) {
      return;
    }

    favorites.splice(index, 1);

    await this.userService.updateCurrent(user);
  }

  /**
   * Returns the current user's favorites, or an empty list when the user has
   * none. Request failures are propagated so callers can tell "no favorites"
   * apart from "could not load favorites".
   */
  private async getFavoritesForCurrentUser(): Promise<string[]> {
    const user = (await this.userService.current()).data;
    const customProperties = user.customProperties as IUserCustomerProperties;

    return customProperties?.favorites ?? [];
  }
}
