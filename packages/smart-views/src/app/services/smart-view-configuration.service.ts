import { inject, Injectable } from '@angular/core';
import { InventoryService } from '@c8y/client';
import { Observable, Subject } from 'rxjs';
import {
  ASSET_DEFINITION_TYPE,
  AssetDefinition,
  SMART_VIEW_CONFIGURATION_TYPE,
  SmartViewConfiguration,
  SmartViewConfigurationDraft,
} from '../smart-views.model';

@Injectable({ providedIn: 'root' })
export class SmartViewConfigurationService {
  private readonly inventoryService = inject(InventoryService);

  private readonly configurationsChangedSubject = new Subject<void>();

  /** Emits whenever a configuration is created, updated or removed. */
  readonly configurationsChanged$: Observable<void> =
    this.configurationsChangedSubject.asObservable();

  /** Loads all smart view configurations from the inventory. */
  async listConfigurations(): Promise<SmartViewConfiguration[]> {
    const { data } = await this.inventoryService.list({
      type: SMART_VIEW_CONFIGURATION_TYPE,
      pageSize: 2000,
      withTotalPages: true,
    });

    return data as SmartViewConfiguration[];
  }

  /** Loads all available asset definitions from the inventory. */
  async listAssetDefinitions(): Promise<AssetDefinition[]> {
    const { data } = await this.inventoryService.list({
      type: ASSET_DEFINITION_TYPE,
      pageSize: 2000,
      withTotalPages: true,
    });

    return data as AssetDefinition[];
  }

  /** Creates a new smart view configuration from the modal draft. */
  async create(draft: SmartViewConfigurationDraft): Promise<SmartViewConfiguration> {
    const { data } = await this.inventoryService.create({
      type: SMART_VIEW_CONFIGURATION_TYPE,
      name: draft.name,
      c8y_SmartViewConfiguration: {
        icon: draft.icon,
        // Best-effort inventory query selecting assets of the chosen definition.
        query: `(type eq '${draft.assetDefinitionName}')`,
        columns: draft.columns,
        assetDefinitionId: draft.assetDefinitionId,
        assetDefinitionName: draft.assetDefinitionName,
      },
    });

    this.configurationsChangedSubject.next();

    return data as SmartViewConfiguration;
  }
}
