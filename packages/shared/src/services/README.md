# Services

## ActiveTabService

Provides a service to track the currently active tab. **Depends on the `LocalStorageService`.**

## DataGridPatchService

If you dont want the c8y-data-grid to use its multi column sort standard, use this hack to force it to use single sort.

## domService

Provides a service to attach and maintain components that attach directly to the html body.

## HierarchyAggregateService

Read custom fragment values and aggregate those over a given hierarchy starting at the parent Managed Object.

## InventoryDeltaPollingService

Fetch Managed Objects matching a certain query after a specified interval. Returns the delta containing MOs that matched later, and MOs which don't match anymore.

## LocalStorageService

A convienience wrapper to access local storage and provides a behavior to subscribe for changes.

## LocationGeocoderService

Returns the latitdue and longitude for a city name using nominatims free service.

## LocationRealtimeService

Register for realtime location update events starting with the latest value.

## ManagedObjectUpdatePollingService

Register for polling updates of a pool of Managed Objects. Checks for changes on these MOs by utilizing the lastUpdated date.

## MeasurementDownloadService

Loads all measurements of a device and converts these into a csv file for download. Progress can be tracked.

## MicroserviceService

A useful abstraction layer in order to easily access custom Microservice endpoints.

## OperationToastService

Shows a toast message which actively tracks the state of an operation, e.g. by showing a loading indicator while the operation is in progress.

## TenantOptionCredentialsService

Provides a save way to create, update and read secrets.

## WidgetConfigurationService

Ever felt the need to update the widget configuration from outside of the config component? Use this service to do this.
