import * as bundledLeaflet from 'leaflet';

/**
 * Canonical leaflet instance for all plugins.
 *
 * leaflet.markercluster's dist never imports leaflet — it resolves the GLOBAL
 * `L` dynamically on every internal call. In the c8y hybrid shell several
 * leaflet copies fight over `window.L` (ngx-components' 1.9.x, ng1-modules'
 * legacy 0.7.7, one bundled copy per plugin), so markercluster silently breaks
 * whenever `window.L` is stomped between its evaluation and a later call
 * ("L.MarkerClusterGroup is not a constructor").
 *
 * Fix: the FIRST plugin to load pins its bundled leaflet as the one
 * canonical instance, so later `window.L = …` assignments (e.g. ng1-modules'
 * 0.7.7) are no-ops. Every windy plugin then works against this canonical
 * instance (never its own bundled copy), so markers/clusters from different
 * plugins stay compatible.
 *
 * The pin is an ACCESSOR with a swallowing setter, not a `writable: false` data
 * property. That distinction is the whole point: assigning to a non-writable
 * property is a silent no-op only in sloppy mode, and every bundled ES module is
 * strict, so `writable: false` made the assignment THROW instead. Observed on
 * windy-dev on 30 Jul 2026: the stock Smart Rules plugin died with
 * `TypeError: Cannot assign to read only property 'L' of object '[object Window]'`
 * and its whole `AnalyticsInstanceModule` failed to load. A setter that ignores
 * writes keeps the pin and lets sloppy AND strict writers carry on.
 *
 * Accepted limitation: anything that expected `window.L` to be a DIFFERENT
 * leaflet (the deprecated ng1 0.7.7 map widget, or a stock plugin's own copy)
 * now reads the pinned 1.9.x instance. It loads and runs; a consumer depending on
 * removed 0.7.7 APIs could still misbehave. That is the trade-off of pinning at
 * all — the alternative is markercluster breaking in every plugin.
 *
 * IMPORT ORDER MATTERS in consumers: this module must be evaluated BEFORE
 * `import 'leaflet.markercluster'` so markercluster augments the pinned instance:
 *
 *   import { L } from './geo-map-leaflet';
 *   import 'leaflet.markercluster';
 */
const g = globalThis as Record<string, unknown>;

if (!g['__psLeaflet']) {
  g['__psLeaflet'] = bundledLeaflet;

  try {
    Object.defineProperty(globalThis, 'L', {
      get: () => bundledLeaflet,
      // Swallows the write instead of rejecting it — see the strict-mode note above.
      set: () => {},
      configurable: true,
    });
  } catch {
    g['L'] = bundledLeaflet;
  }
}

export const L = g['__psLeaflet'] as typeof bundledLeaflet;
