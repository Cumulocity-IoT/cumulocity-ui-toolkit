# Shared Changelog

## Unreleased — 2026-06-23

### Features

- **`ApplicationAvailabilityService`**: New shared service to check (and cache) whether an application/microservice is installed in the current tenant, matched by name or context path. Use it to gate features that depend on an optional microservice.
- **`DtmService`**: New thin client for the Digital Twin Manager microservice (`service/dtm`), extending `MicroserviceService`. Exposes `getAssetTypes()` (asset definitions) and `getAssetTypeProperties(identifier)` (properties from an asset definition's JSON schema); structured to grow additional DTM endpoints. See https://cumulocity.com/api/dtm/.
- **`PSQueryDisplayComponent` (`ps-query-display`)**: New standalone component that visualizes a Cumulocity inventory query string as a tokenized, color-coded clause rail with a raw-string toggle. Ships with its `Tokenizer` helper.

### Changes

- Exported `ApplicationAvailabilityService`, `DtmService`, and `PSQueryDisplayComponent` from the package entry point (`src/index.ts`).

### Fixes

- N/A
