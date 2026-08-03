import { Injectable } from '@angular/core';
import { MicroserviceService } from './microservice.service';

/** Context path of the Digital Twin Manager microservice. */
export const DTM_CONTEXT_PATH = 'dtm';

/**
 * A DTM asset type (a.k.a. asset definition). The `identifier` is the value
 * stored on managed objects as their `type`, so it can be used directly in an
 * inventory query (`type eq '<identifier>'`).
 */
/** Internal representation of an icon from a DTM asset definition. */
export interface DtmAssetTypeIcon {
  name: string;
}

/** Type guard for icon objects from DTM asset definitions. */
export function isDtmAssetTypeIcon(value: unknown): value is DtmAssetTypeIcon {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'name' in value &&
    typeof (value as Record<string, unknown>).name === 'string'
  );
}

export interface DtmAssetType {
  identifier: string;
  label: string;
  icon?: DtmAssetTypeIcon;
}

/** A property defined on a DTM asset type (from its JSON schema). */
export interface DtmAssetProperty {
  /** Property key as stored on the managed object. */
  name: string;
  /** Human readable label for display. */
  label: string;
}

/**
 * Thin client for the Digital Twin Manager microservice (`service/dtm`).
 * Abstracts the DTM REST endpoints documented at https://cumulocity.com/api/dtm/.
 * Extend with additional endpoints (assets, properties, ...) as needed.
 */
@Injectable({ providedIn: 'root' })
export class DtmService extends MicroserviceService {
  private readonly baseUrl = `service/${DTM_CONTEXT_PATH}`;

  /**
   * Lists all asset types (asset definitions) configured in the tenant.
   * GET `service/dtm/definitions/assets`.
   */
  async getAssetTypes(): Promise<DtmAssetType[]> {
    const response = await this.get(`${this.baseUrl}/definitions/assets`);

    return this.extractCollection(response)
      .map((definition) => this.toAssetType(definition))
      .filter((type): type is DtmAssetType => !!type);
  }

  /**
   * Lists the properties defined for a single asset type, read from the asset
   * definition's JSON schema. GET `service/dtm/definitions/assets/{identifier}`.
   */
  async getAssetTypeProperties(identifier: string): Promise<DtmAssetProperty[]> {
    const definition = (await this.get(
      `${this.baseUrl}/definitions/assets/${encodeURIComponent(identifier)}`
    )) as { jsonSchema?: { properties?: Record<string, { title?: string }> } } | undefined;

    const properties = definition?.jsonSchema?.properties;

    if (!properties) {
      return [];
    }

    return Object.entries(properties).map(([name, property]) => ({
      name,
      label: property?.title || name,
    }));
  }

  private toAssetType(definition: Record<string, unknown>): DtmAssetType | undefined {
    const identifier = (definition?.identifier ?? definition?.type ?? definition?.name) as
      | string
      | undefined;

    if (!identifier) {
      return undefined;
    }

    const schema = definition?.jsonSchema as { title?: string } | undefined;
    const icon: DtmAssetTypeIcon | undefined = isDtmAssetTypeIcon(definition?.icon)
      ? { name: definition.icon.name }
      : undefined;
    const label =
      schema?.title ?? (definition?.label as string) ?? (definition?.name as string) ?? identifier;

    return { identifier, label, icon };
  }

  /**
   * The DTM collection responses are not guaranteed to use a fixed wrapper key,
   * so pick the first array found (or the response itself if it is an array).
   */
  private extractCollection(response: unknown): Record<string, unknown>[] {
    if (Array.isArray(response)) {
      return response as Record<string, unknown>[];
    }

    if (response && typeof response === 'object') {
      const arrays = Object.values(response as Record<string, unknown>).filter((value) =>
        Array.isArray(value)
      );

      if (arrays.length) {
        return arrays[0] as Record<string, unknown>[];
      }
    }

    return [];
  }
}
