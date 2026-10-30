/**
 * Public contract of the generic geo map component.
 * Design: docs/FastNavigation/map-component-design.md
 *
 * `GeoMapConfig` (including the popup layout) is 100% JSON-serializable so it
 * can be persisted in dashboard widget configuration or tenant options.
 */

/** Dot-path into a `GeoMapItem`, e.g. `'id'`, `'data.name'`, `'data.kpis.windSpeed'`. */
export type GeoMapBinding = string;

export type GeoMapFormat =
  | 'number:0'
  | 'number:1'
  | 'number:2'
  | 'datetime'
  | 'relative-time'
  | 'percent'
  /** Value is `{critical, major, minor, warning}` counts — rendered as the four c8y severity icons + numbers. */
  | 'alarm-severities';

export interface GeoMapCategory {
  id: string;
  label: string;
  /** Any CSS color — c8y tokens encouraged, e.g. `'var(--c8y-palette-status-danger)'`. */
  color: string;
  /** c8y icon name (rendered as `dlt-c8y-icon-<name>`), shown inside the pin. */
  icon?: string;
}

/** Sections stack vertically by default; two consecutive `layout: 'half'` sections share a row. */
interface GeoMapPopupSectionLayout {
  layout?: 'full' | 'half';
}

export type GeoMapPopupSection = GeoMapPopupSectionLayout &
  (
    | { type: 'header'; title: GeoMapBinding; subtitle?: GeoMapBinding; link?: GeoMapBinding }
    | {
        type: 'properties';
        rows: { label: string; value: GeoMapBinding; format?: GeoMapFormat }[];
      }
    | {
        type: 'kpi-bars';
        bars: {
          label: string;
          value: GeoMapBinding;
          min: number;
          max: number;
          unit?: string;
          /** Optional CSS color for the bar fill; defaults to the info status token. */
          color?: string;
        }[];
      }
    | {
        type: 'chart';
        kind: 'bar' | 'pie' | 'line';
        /**
         * Binding to a ready-made array on the item:
         * bar/pie → `{ label: string; value: number; categoryId?: string }[]`,
         * line → `{ x: number | string; y: number }[]`.
         */
        data: GeoMapBinding;
      }
    | {
        type: 'table';
        source: 'children';
        columns: { label: string; value: GeoMapBinding }[];
        pageSize?: number;
      }
    | { type: 'actions'; actions: { id: string; label: string; icon?: string }[] }
  );

export interface GeoMapTileLayer {
  layerUrl: string;
  label: string;
  attribution?: string;
}

export interface GeoMapConfig {
  categories: GeoMapCategory[];
  /** Text under the pin (e.g. `'id'`); hidden while clustered. Omit for no label. */
  marker?: { label?: GeoMapBinding };
  popup?: { trigger?: 'hover' | 'click' | 'off'; sections: GeoMapPopupSection[] };
  /** Defaults: enabled + ring both true. */
  cluster?: { enabled?: boolean; ring?: boolean };
  /** Outline the area covered by a marker's `children` (convex hull). Default 'off'. */
  reveal?: 'hover' | 'popup' | 'off';
  /** Override tiles; default is OSM (tenant `map-layers` support: future). */
  tiles?: GeoMapTileLayer[];
  initialView?: { center: { lat: number; lng: number }; zoom: number };
}

export interface GeoMapItem {
  /** Identity — popups, selection, and diffing all key on this, never on the object. */
  id: string;
  /** Absent → the item is silently not rendered. */
  position?: { lat: number; lng: number };
  /** Drives marker color/icon and the cluster ring segment. Unknown → neutral. */
  categoryId?: string;
  /** The bag all popup bindings resolve against. */
  data: Record<string, unknown>;
  /** Preview sub-items: reveal layer + popup `table` section. */
  children?: GeoMapItem[];
}
