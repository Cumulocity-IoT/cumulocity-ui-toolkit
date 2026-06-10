import { inject, Injectable } from '@angular/core';
import {
  DtmAssetDefinition,
  DtmDefinitionsResponse,
  DtmPropertyDefinition,
} from '../models/dtm.model';
import { MicroserviceService } from './microservice.service';

const DTM_BASE = '/service/dtm';

/**
 * Client for the Cumulocity Digital Twin Manager (DTM) microservice.
 *
 * Covers the subset of the DTM Definition API used across UI plugins:
 * - `GET /service/dtm/definitions/assets/{identifier}`
 * - `GET /service/dtm/definitions/properties?identifiers=…&applicableTo=asset`
 *
 * Full API spec: https://cumulocity.com/api/dtm/
 */
@Injectable({ providedIn: 'root' })
export class DtmService {
  private readonly ms = inject(MicroserviceService);

  /**
   * Retrieves a single Asset Definition by its DTM identifier
   * (e.g. `"c8y_Windfarm"`).
   *
   * `GET /service/dtm/definitions/assets/{identifier}`
   */
  async getAssetDefinition(identifier: string): Promise<DtmAssetDefinition> {
    return this.ms.get(
      `${DTM_BASE}/definitions/assets/${encodeURIComponent(identifier)}`
    ) as Promise<DtmAssetDefinition>;
  }

  /**
   * Retrieves Property Definitions for the given identifiers, filtered to the
   * `asset` context.
   *
   * `GET /service/dtm/definitions/properties?identifiers=A,B,C&applicableTo=asset&pageSize=2000`
   *
   * Returns an empty array when `identifiers` is empty.
   */
  async getPropertyDefinitions(identifiers: string[]): Promise<DtmPropertyDefinition[]> {
    if (!identifiers.length) {
      return [];
    }

    const params = new URLSearchParams({
      identifiers: identifiers.join(','),
      applicableTo: 'asset',
      pageSize: '2000',
    });

    const response = (await this.ms.get(
      `${DTM_BASE}/definitions/properties?${params.toString()}`
    )) as DtmDefinitionsResponse<DtmPropertyDefinition>;

    return response.definitions ?? [];
  }
}
