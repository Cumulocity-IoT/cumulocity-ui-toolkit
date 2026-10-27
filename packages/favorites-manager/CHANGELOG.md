# Favorites Manager Changelog

## 2.0.0

### Breaking Changes

- Built for Cumulocity Web SDK 1024.21.x / Angular 21: needs a cockpit on 1024 or newer (part of toolkit release v1.0.0). Stay on 1.0.2 for 1023 shells.

### Bug Fixes

- The favorite star finds the device or group on 1024's nested device tabs.
- Pages without a device or group no longer raise an error; the star is simply not shown.
