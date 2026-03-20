# Services

Shared Angular services provided by the `shared` package.

---

## `ActiveTabService`

Tracks and persists the currently active tab using `LocalStorageService`. Requires `LocalStorageService` to be provided.

---

## `DataGridPatchService`

Forces the `c8y-data-grid` component to use single-column sorting instead of its default multi-column sort behaviour. Inject this service in any component that hosts a data grid to apply the patch.

---

## `DomService`

Dynamically creates Angular components and attaches them directly to `document.body` outside of the normal component tree.

| Method | Description |
|---|---|
| `createComponent<T>(component)` | Creates the component, attaches it to the app view, and appends its root element to `<body>`. Returns the `ComponentRef`. |
| `destroyComponent(componentRef)` | Detaches the view and destroys the component. |

---

## `HierarchyAggregationService`

Recursively resolves the full child hierarchy of a Managed Object and provides reactive helpers for extracting and aggregating attribute values across descendants. Results are cached per MO id.

| Method | Description |
|---|---|
| `getAllChildrenOfManagedObject$(moId, cache?)` | Returns an `Observable<IManagedObject[]>` of all descendants (recursive). Emits `[]` until data arrives. |
| `getAttributeValueOfAllChildren$(extractFn, moId)` | Maps all descendants through an extractor function and emits the resulting array. |
| `getUniqAttributeValueOfAllChildren$(extractFn, moId)` | Same as above, but deduplicates the result with lodash `uniq`. |

---

## `InventoryDeltaPollingService`

Polls the Inventory API at a configurable interval and emits only the **delta** — newly matching MOs (`add`) and MOs that no longer match (`remove`). Must be provided at the component or module level (not `providedIn: 'root'`).

```typescript
export type InventoryDelta = {
  add: IManagedObject[];
  remove: string[];  // ids
};
```

| Method | Description |
|---|---|
| `createPolling$(filter, interval?, existingIds?)` | Returns an `Observable<InventoryDelta>`. Default interval: 5 000 ms. |

---

## `LocalStorageService`

A typed wrapper around `localStorage` with debounced change notifications via a `Subject`. Must be provided at the component or module level.

Call `init()` once after injection to start listening for cross-tab storage events.

| Method | Description |
|---|---|
| `init()` | Starts the `storage` event listener. |
| `get<T>(key)` | Returns the parsed value or `undefined`. |
| `getOrDefault<T>(key, default)` | Returns the stored value, or `default` if absent. |
| `set<T>(key, value)` | Serialises and stores the value. Returns the value. |
| `delete(key)` | Removes the key from `localStorage`. |
| `destroy()` | Completes the `storage$` Subject. |
| `storage$` | `Subject` — emits the full `localStorage` snapshot after a debounced storage event (default 100 ms). |
| `debounceTime` | Getter/setter for the debounce delay in ms. |

---

## `LocationGeocoderService`

Geocodes a city name to `{ lat, lon }` coordinates using the free [Nominatim](https://nominatim.openstreetmap.org) API. Calls are throttled to 200 ms.

```typescript
const coords = await locationGeocoderService.geoCode('Berlin');
// { lat: 52.520008, lon: 13.404954 }
```

---

## `LocationRealtimeService`

Subscribes to `c8y_LocationUpdate` events for a set of devices via Cumulocity realtime, seeding each stream with the latest historical event. Emits only in-order events (monotonically increasing `time`).

| Method | Description |
|---|---|
| `startListening(devices)` | Returns a `Map<deviceId, Observable<ILocationUpdateEvent>>`. |
| `fetchLatestAndRealtime$(sourceId)` | Returns a single merged Observable for one device. |

```typescript
export interface ILocationUpdateEvent extends IEvent {
  c8y_Position: { lat: number; lng: number; alt: number; accuracy: number };
  type: 'c8y_LocationUpdate';
}
```

---

## `ManagedObjectUpdatePollingService`

Polls the Inventory API for MOs that have been updated since the last poll, identified by the `lastUpdated` field. Stops polling after 10 consecutive failures. Must be provided at the component or module level.

| Method | Description |
|---|---|
| `startListening(queryExtension, interval?)` | Starts polling and returns `update$`. Default interval: 5 000 ms. |
| `stopListening()` | Stops the polling loop and cleans up subscriptions. |
| `update$` | `Observable<IManagedObject[]>` — emits the changed MOs on each poll cycle. |

---

## `MeasurementDownloadService`

Loads all measurements for a device across all pages and converts them to a CSV file for download. Supports progress tracking while fetching.

| Method | Description |
|---|---|
| `getMeasurementsWithProgress(source)` | Returns `Observable<{ progress: number; measurements: IMeasurement[] }>`. Emits once per page fetched; `progress` is 0–100. |
| `prepare(measurements)` | Converts an array of `IMeasurement` to a CSV string. |
| `download(csvText)` | Triggers a browser file-save dialog with a timestamped filename. |

---

## `MicroserviceService`

A thin, typed wrapper around `FetchClient` for calling custom Cumulocity Microservice endpoints. Provided in root.

| Method | Description |
|---|---|
| `get(url, handler?)` | Performs a GET request. |
| `post(url, data, handler?)` | Performs a POST request with a JSON body. |
| `put(url, data, handler?)` | Performs a PUT request with a JSON body. |
| `delete(url)` | Performs a DELETE request. Throws on non-2xx. |

The default response handler deserialises JSON and throws a readable `Error` on non-2xx responses. Pass a custom `handler` to override this behaviour per call.

---

## `OperationToastService`

Displays an `AlertService` toast that automatically transitions from a loading state to success or danger once the operation's realtime status resolves.

| Method | Description |
|---|---|
| `add(alert)` | Shows the alert and subscribes to realtime updates for the operation. Returns an `Observable` that emits when the operation reaches `SUCCESSFUL` or `FAILED`. |
| `remove(alert)` | Removes the alert and cancels the realtime subscription. |

```typescript
export interface OperationAlert extends Alert {
  operationDetails: {
    deviceId: string;
    uuid: string;  // matches the operation's uuid field
  };
}
```

---

## `TenantOptionCredentialsService`

Stores and retrieves credentials (username + password pairs) as Cumulocity tenant options. Passwords are stored under `credentials.<token>.password` so they are automatically encrypted by the platform. Provided in root.

| Method | Description |
|---|---|
| `saveCredentials(credentials)` | Stores the pair and returns a `Promise<token>`. |
| `getCredentials(token)` | Retrieves `{ username, password }` for the given token. |
| `deleteCredentials(token)` | Deletes both tenant options for the token. |
| `clearAllCredentials()` | Deletes all options in the service's credential category. |

---

## `WidgetConfigurationService`

Reads and writes widget configuration directly on the `c8y_Dashboard` Managed Object, enabling configuration updates from outside the widget config component.

| Method | Description |
|---|---|
| `getWidgetConfiguration(dashboardId, widgetId)` | Returns `Promise<unknown>` resolving to the widget's `config` object. |
| `updateWidgetConfiguration(dashboardId, widgetId, newConfig)` | Patches the widget's config in the dashboard MO and saves it. Shows an alert on failure. |
