import { Component, OnInit } from '@angular/core';
import { FavoritesManagerService } from './favorites-manager.service';
import { IManagedObject } from '@c8y/client';
import { Column, CoreModule, Pagination } from '@c8y/ngx-components';
import {
  AlarmsDeviceGridColumn,
  NameDeviceGridColumn,
  SystemIdDeviceGridColumn,
} from '@c8y/ngx-components/device-grid';
import { StatusExtendedDeviceGridColumn } from './columns/status-extended.device-grid-column';
import { ObjectTypeColumn } from './columns/object-type.grid-column';
import { TypeColumn } from './columns/type.grid-column';

@Component({
  selector: 'c8y-favorites-manager',
  templateUrl: 'favorites-manager.component.html',
  standalone: true,
  imports: [CoreModule],
  providers: [FavoritesManagerService],
})
export class FavoritesManagerComponent implements OnInit {
  readonly PAGINATION: Pagination = {
    pageSize: 50,
    currentPage: 1,
  };

  readonly COLUMNS: Column[] = [
    new StatusExtendedDeviceGridColumn(),
    new NameDeviceGridColumn(),
    new SystemIdDeviceGridColumn(),
    new TypeColumn(),
    new AlarmsDeviceGridColumn(),
    new ObjectTypeColumn(),
  ];

  managedObjects: IManagedObject[] = [];

  constructor(protected favoritesManagerService: FavoritesManagerService) {}

  ngOnInit() {
    void this.favoritesManagerService.initFavorites();
  }
}
