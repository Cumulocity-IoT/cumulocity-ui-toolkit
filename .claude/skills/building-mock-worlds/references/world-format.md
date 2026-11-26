# World file format

A world is JSON. Everything is optional except what the UI needs; the mock fills sensible defaults.

```jsonc
{
  "description": "What this world is for",
  "now": "2026-10-14T12:00:00.000Z",     // anchor of all timestamps (default: load time)
  "live": true,                            // shift so that now = load time, clock runs (default); false = frozen clock
  "tenant": { "id": "t100", "domain": "mock.localhost" },
  "currentUser": "admin",                  // the user the app runs as; created with admin roles if missing
  "features": { "ui.datapoint-graph.v2": true },   // feature toggles (GET /features)

  "managedObjects": [ … ],
  "childAssets":    { "<parentId>": ["<childId>", …] },   // group → members (the asset hierarchy)
  "childDevices":   { "<parentId>": ["<childId>", …] },   // gateway → child devices
  "childAdditions": { "<parentId>": ["<childId>", …] },   // object → additions (dashboards are placed here automatically)
  "externalIds":    [ { "type": "c8y_Serial", "externalId": "SN-1", "managedObjectId": "2001" } ],

  "series":       [ … ],   // generated measurements (preferred)
  "measurements": [ … ],   // literal measurements (only for a few exact values)
  "alarms":       [ … ],
  "events":       [ … ],
  "operations":   [ … ],
  "dashboards":   [ … ],   // dashboard sugar, see below

  "users": [ … ], "userGroups": [ … ], "tenantOptions": [ … ], "applications": [ … ],
  "binaries": [ { "id": "5001", "name": "logo.svg", "type": "image/svg+xml", "content": "<svg …>" } ]
                  // a file that is not text: "content": "<base64>", "encoding": "base64" (what export writes)
}
```

## Managed objects

```json
{ "id": "2001", "name": "Pump 01", "type": "acme_Pump", "owner": "admin",
  "creationTime": "2026-09-01T08:00:00.000Z", "lastUpdated": "2026-10-14T12:00:00.000Z",
  "c8y_IsDevice": {}, "c8y_Position": { "lat": 51.22, "lng": 6.77, "alt": 38 },
  "c8y_Hardware": { "model": "P-200", "serialNumber": "ACME-2001" },
  "c8y_Firmware": { "name": "pump-fw", "version": "2.4.1" },
  "c8y_SupportedOperations": ["c8y_Restart", "c8y_Command"],
  "c8y_RequiredAvailability": { "responseInterval": 30 },
  "c8y_Availability": { "status": "AVAILABLE", "lastMessage": "2026-10-14T12:00:00.000Z" } }
```

Groups: `"type": "c8y_DeviceGroup", "c8y_IsDeviceGroup": {}`. Subgroups: `"type": "c8y_DeviceSubgroup"`.
Devices show in the cockpit's group tree only through `childAssets`.

## Series (generated measurements)

```json
{ "source": "2001", "fragment": "c8y_Temperature", "series": "T", "unit": "C",
  "every": "10m", "span": "7d", "shape": "sine", "min": 45, "max": 70, "period": "1d", "noise": 0.04, "decimals": 1 }
```

| Field | Meaning |
|---|---|
| `every` / `span` | step and length (`30s`, `5m`, `1h`, `7d`, `2w`); the last value is at `now` |
| `shape` | `sine` (default, daily cycle), `random-walk`, `sawtooth`, `step` (random level jumps), `constant` |
| `min` / `max` | value range (default 0–100); values never leave it |
| `period` | cycle of `sine` and `sawtooth` (default `1d`) |
| `noise` | random jitter as a share of the range (0.05 = 5 %) |
| `type` | measurement type (default: the fragment) |
| `seed` | same seed → same values (default: derived from source/fragment/series) |
| `measurement` | series of one source with the same key share one measurement per point (several values in one uplink); give them the same `type`, `every` and `span` |

The mock computes series when they are read, so long or fine series cost little memory. For a readable chart, about
1000–3000 points per series is plenty (7 days every 10 minutes = 1008).

A device that sends several values at once (pressure and temperature in one uplink):

```json
{ "source": "2001", "type": "uplink", "measurement": "uplink", "fragment": "c8y_Pressure", "series": "P", "unit": "bar", "every": "15m", "span": "7d" },
{ "source": "2001", "type": "uplink", "measurement": "uplink", "fragment": "c8y_Temperature", "series": "T", "unit": "C", "every": "15m", "span": "7d" }
```

## Alarms, events, operations

```json
{ "id": "3001", "type": "acme_Overheat", "text": "Bearing temperature above 80 C", "severity": "CRITICAL",
  "status": "ACTIVE", "time": "2026-10-14T10:42:00.000Z", "creationTime": "2026-10-14T10:42:00.000Z",
  "lastUpdated": "2026-10-14T10:42:00.000Z", "count": 1, "source": { "id": "2003" } }
```
Severity: `CRITICAL | MAJOR | MINOR | WARNING`; status: `ACTIVE | ACKNOWLEDGED | CLEARED`. A tenant keeps one open
(`ACTIVE` or `ACKNOWLEDGED`) alarm per source and type and counts repeats in it: give it a `count` (and
`firstOccurrenceTime`) instead of a second alarm, which the mock refuses (`world check` names it). Cleared alarms of the
same type may repeat.

```json
{ "id": "4001", "type": "acme_Maintenance", "text": "Seal replaced", "time": "2026-10-13T09:00:00.000Z",
  "creationTime": "2026-10-13T09:00:00.000Z", "lastUpdated": "2026-10-13T09:00:00.000Z", "source": { "id": "2001" } }
```

```json
{ "id": "6001", "deviceId": "2001", "status": "PENDING", "creationTime": "2026-10-14T11:00:00.000Z",
  "description": "Restart device", "c8y_Restart": {} }
```
Status: `PENDING | EXECUTING | SUCCESSFUL | FAILED` (`failureReason` with FAILED).

## Dashboards (sugar)

```json
{ "name": "Overview", "icon": "th", "on": { "group": "1001" }, "apps": ["cockpit-application-key"], "priority": 10,
  "widgets": [
    { "componentId": "kpi.widget", "title": "Temperature", "x": 0, "y": 0, "width": 6, "height": 3, "config": { … } }
  ] }
```

| `on` | Shows on | Stored as |
|---|---|---|
| `{ "group": "<id>" }` | that group's tabs | `c8y_Dashboard!group!<id>` + child addition of the group |
| `{ "device": "<id>" }` | that device's tabs | `c8y_Dashboard!device!<id>` + child addition of the device |
| `{ "type": "<type>" }` | every device of that type | `c8y_Dashboard!type!<type>`, `deviceType: true`, `c8y_Global` |
| `{ "name": "home-cockpit1" }` | the cockpit home page | `c8y_Dashboard!name!home-cockpit1`, `c8y_Global` |

Grid: 24 columns, `x + width ≤ 24`; `height` in rows (~ 60–70 px each); widgets must not overlap. `apps` limits the
dashboard to applications by key (`c8y_AppliedToApplications`); leave it out to show it everywhere.

The sugar writes the dashboard the way the cockpit's create does: `created`/`author`, `historyDescription:
{ changeType: 'create' }`, and `c8y_DashboardHistory` starting with a copy of it (the version history tab needs it).

Dashboards written as raw managed objects (e.g. from `c8y-ui world export`) work too; they need `c8y_Dashboard` with
`columns: 24`, `children` keyed by widget id (`{ id, componentId, title, config, _x, _y, _width, _height }`) and
the placement fragment.

## Live clock

With `live` (default) the mock moves every ISO timestamp in the file by (start time − `now`) — measurements,
alarms, widget date ranges alike — and from then on the clock is the real one: what the UI creates is stamped with
the current time. Use `"live": false` for tests that compare exact timestamps.

## Users and login

`currentUser` gets a user and an `admins` group with every admin role if the world does not define them. For
permission tests, define `users` (with optional `password`) and `userGroups` (with `roles`) and run the mock with
`--auth login`.
