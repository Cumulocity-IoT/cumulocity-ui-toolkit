/**
 * DTM API type definitions derived from the DTM OpenAPI specification
 * at https://cumulocity.com/api/dtm/dist/c8y-dtm-oas.json.
 *
 * Base path: /service/dtm
 */

/** JSON Schema fragment attached to every DTM definition. */
export interface DtmJsonSchema {
  title: string;
  description?: string;
  /** JSON Schema primitive type, e.g. "object", "string", "number". */
  type?: string;
  /** Sub-properties for complex ("object") properties. */
  properties?: Record<string, DtmJsonSchema>;
  [key: string]: unknown;
}

/**
 * Reference to an allowed property on an Asset Definition.
 * Returned inside `AssetDefinition.composition.allowedProperties[]`.
 */
export interface DtmAllowedProperty {
  /** DTM identifier of the property definition, e.g. `"Country"`. */
  identifier: string;
  /** `"0"` = optional, `"1"` = required. */
  minOccurs?: string;
}

/**
 * Asset Definition as returned by
 * `GET /service/dtm/definitions/assets/{identifier}`.
 */
export interface DtmAssetDefinition {
  identifier: string;
  jsonSchema?: DtmJsonSchema;
  composition?: {
    allowedProperties?: DtmAllowedProperty[];
    allowedSubAssets?: { identifier: string }[];
    additionalProperties?: boolean;
    additionalSubAssets?: boolean;
  };
  tags?: string[];
  creationTime?: string;
  lastUpdated?: string;
}

/**
 * Property Definition as returned by
 * `GET /service/dtm/definitions/properties`.
 */
export interface DtmPropertyDefinition {
  /** DTM identifier, e.g. `"Country"`. Also the fragment key on asset MOs. */
  identifier: string;
  jsonSchema: DtmJsonSchema;
  tags?: string[];
  /** Domain contexts this property applies to, e.g. `["asset"]`. */
  contexts?: string[];
  creationTime?: string;
  lastUpdated?: string;
}

/**
 * Paginated list response shape shared by all DTM definition list endpoints.
 * Schema name in the spec: `PaginatedDefinitionList`.
 */
export interface DtmDefinitionsResponse<T> {
  definitions: T[];
  statistics: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalElements: number;
  };
  self?: string;
  next?: string;
  prev?: string;
}
