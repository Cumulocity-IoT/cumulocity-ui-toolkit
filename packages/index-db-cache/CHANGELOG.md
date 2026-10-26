# IndexedDB Cache Changelog

## 1.1.4

### Bug Fixes

- The cache drawer starts right below the page toolbar and right of the navigator, measured from the shell instead of fixed offsets (`top: 171px; left: 250px`). It follows the navigator while open: expanded, collapsed to a narrow rail (as with the asset navigator), or closed completely, where it starts at the page's left edge. Previously it overlapped the toolbar or left a gap next to a collapsed navigator.
