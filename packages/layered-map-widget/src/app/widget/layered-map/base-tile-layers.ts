export type BaseTileLayerId =
  | 'osm'
  | 'esri-satellite'
  | 'esri-streets'
  | 'carto-light'
  | 'carto-dark'
  | 'open-topo';

/** A user-defined tile layer stored in inventory. */
export interface CustomBaseTileLayerEntry {
  id: string;
  label: string;
  url: string;
  attribution?: string;
  maxZoom?: number;
  subdomains?: string;
}

export interface BaseTileLayerDef {
  /** Built-in ID or custom-layer UUID. */
  id: string;
  label: string;
  url: string;
  maxZoom: number;
  maxNativeZoom: number;
  attribution: string;
  subdomains?: string;
}

/** The OpenStreetMap raster tile endpoint, referenced by every map in this widget. */
export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Tile options shared by the editor maps (center picker, track creators). */
export const OSM_TILE_OPTIONS = {
  maxZoom: 22,
  maxNativeZoom: 19,
  detectRetina: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
} as const;

export const BASE_TILE_LAYERS: BaseTileLayerDef[] = [
  {
    id: 'osm',
    label: 'OpenStreetMap',
    url: OSM_TILE_URL,
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: 'esri-satellite',
    label: 'Satellite (ESRI)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
  {
    id: 'esri-streets',
    label: 'Streets (ESRI)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
  },
  {
    id: 'carto-light',
    label: 'Light (CartoDB)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
  },
  {
    id: 'carto-dark',
    label: 'Dark (CartoDB)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    maxZoom: 19,
    maxNativeZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
  },
  {
    id: 'open-topo',
    label: 'Topographic',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    maxNativeZoom: 17,
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
];

export const DEFAULT_BASE_TILE_LAYER_ID: BaseTileLayerId = 'osm';

/**
 * The fallback definition, resolved eagerly so callers get a guaranteed value
 * instead of `find()`'s `BaseTileLayerDef | undefined`.
 */
export const DEFAULT_BASE_TILE_LAYER: BaseTileLayerDef =
  BASE_TILE_LAYERS.find((l) => l.id === DEFAULT_BASE_TILE_LAYER_ID) ?? BASE_TILE_LAYERS[0];

export function customEntryToDef(entry: CustomBaseTileLayerEntry): BaseTileLayerDef {
  const zoom = entry.maxZoom ?? 19;
  return {
    id: entry.id,
    label: entry.label,
    url: entry.url,
    maxZoom: zoom,
    maxNativeZoom: zoom,
    attribution: entry.attribution ?? '',
    ...(entry.subdomains ? { subdomains: entry.subdomains } : {}),
  };
}
