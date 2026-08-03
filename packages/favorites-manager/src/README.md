# Favorites Manager

Mark any Cumulocity device, asset, or group as a personal favourite for quick access. Favourites are stored per-user in the Cumulocity user profile.

## Features

- **Toggle favourites** — A star action button on every device/asset detail page lets users add or remove an item from their personal favourites list.
- **Favorites list view** — A dedicated navigator entry shows all favourited objects in a data grid with columns for status, name, system ID, type, alarms, and object type.
- **Persistent storage** — Favourites are stored in `customProperties.favorites` on the Cumulocity user record, surviving browser restarts and cross-device sessions.
- **Automatic deduplication** — Adding the same object twice is handled gracefully.

## Navigation

The plugin registers a **Favorites** entry under the main navigator (star icon). The route is `/favorites`.

## Action bar integration

An action bar item is injected into every asset/device context page. It reads the current favourite status on load and toggles it on click.

## Module

`favoritesManagerViewProviders` — exported from `./src/app/modules/favorites-manager/index.ts`

## Key internals

| Symbol | Purpose |
|---|---|
| `FavoritesManagerComponent` | Data grid listing all favourited managed objects |
| `FavoritesActionComponent` | Standalone action-bar component for toggling favourite state |
| `FavoritesManagerService` | CRUD operations on the favourites list (stored on the user record) |
| `StatusExtendedDeviceGridColumn` | Custom grid column showing device connectivity status |
| `ObjectTypeColumn` | Grid column showing whether the object is a device, group, or asset |
