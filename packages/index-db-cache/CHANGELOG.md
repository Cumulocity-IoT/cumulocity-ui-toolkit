# IndexedDB Cache Changelog

## 2.0.0

### Breaking Changes

- Built for Cumulocity Web SDK 1024.21.x / Angular 21: needs a cockpit on 1024 or newer (part of toolkit release v1.0.0). Stay on 1.1.3 for 1023 shells.

### Bug Fixes

- The cache drawer starts right below the page toolbar and right of the navigator, measured from the shell instead of fixed offsets (`top: 171px; left: 250px`). It follows the navigator while open: expanded, collapsed to a narrow rail (as with the asset navigator), or closed completely, where it starts at the page's left edge. Previously it overlapped the toolbar or left a gap next to a collapsed navigator.
- When the cache fails (IndexedDB unavailable, full, or blocked by an older tab), requests go to the network instead of failing.
- The bucket at "now" is always refetched, so a live chart's latest aggregate no longer stays frozen until the next day.
- Latest-first, later-page and type-filtered measurement requests bypass the cache instead of getting the wrong data.
- The drawer only follows the navigator's own animations, and stops even when a `transitionend` never arrives.
