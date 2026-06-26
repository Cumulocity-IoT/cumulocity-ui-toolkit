import { IAlarm, IEvent, IManagedObject, IOperation } from '@c8y/client';
import { FeatureGroup, LatLng, Marker } from 'leaflet';
import { has } from 'lodash';

export type BasicLayerConfig = {
  name: string;
  icon: string;
  color: string;
  pollingInterval: number;
  enablePolling: boolean;
  popoverConfig?: PopoverConfig;
};

export type PopoverConfig = {
  showAlarms: boolean;
  showDate: boolean;
  /**
   * Show the device's latest measurement values (`c8y_LatestMeasurements`
   * fragment). Requires the "latest value" feature to be enabled in the tenant.
   * See https://cumulocity.com/docs/standard-tenant/managing-data/#latest-value
   */
  showLatestValues: boolean;
  /**
   * Managed-object property paths to display in the popover. Pre-populated from
   * a DTM asset type's defined properties, but any property path can be added.
   */
  assetProperties: string[];
  actions: PopoverAction[];
};

export type OperationAction = { type: 'operation'; label: string; body: Partial<IOperation> };
export type AlarmAction = { type: 'alarm'; label: string; body: Partial<IAlarm> };
export type EventAction = { type: 'event'; label: string; body: Partial<IEvent> };
export type PopoverAction = OperationAction | AlarmAction | EventAction;

export const DEFAULT_CONFIG: PopoverConfig = {
  showAlarms: true,
  showDate: true,
  showLatestValues: false,
  assetProperties: [],
  actions: [],
};

export type QueryLayerConfig = BasicLayerConfig & {
  filter: Record<string, unknown>;
  type: 'Inventory' | 'Alarm' | 'Event';
  /**
   * Set when the layer was created from a DTM asset type. The query itself is a
   * regular inventory query (`type eq '<assetType>'`); this only flags the
   * origin so the configuration UI can re-show the asset-type picker on edit.
   */
  assetType?: string;
};

export function isQueryLayerConfig(config: BasicLayerConfig): config is QueryLayerConfig {
  return has(config, 'filter');
}

export type LayerConfig<LayerType> = {
  config: LayerType;
  active: boolean;
};

export type LayerAttributes = {
  active: boolean;
  devices: string[];
  coordinates: Map<string, LatLng>;
  markerCache: Map<string, Marker>;
  group: FeatureGroup;
};

export class MyLayer implements LayerAttributes {
  config!: QueryLayerConfig;
  devices: string[] = [];
  coordinates = new Map<string, LatLng>();
  markerCache = new Map<string, Marker>();
  group = new FeatureGroup();
  initialLoad?: Promise<void>;
  active = true;
}

export type PollingDelta = {
  add: IManagedObject[];
  remove: string[];
};

export interface ILayeredMapWidgetConfig {
  devices?: { name: string; id: string }[];
  selectedTrack?: string;
  tracks?: ITrack[];
  saved?: boolean;
  layers: LayerConfig<BasicLayerConfig>[];
  baseTileLayerId?: string;
  positionPolling?: {
    enabled: boolean;
    interval: number;
  };
  autoCenter?: boolean;
  manualCenter: {
    lat: number;
    long: number;
    zoomLevel: number;
  };
}

export interface ITrack {
  name: string;
  coords: LatLng[];
  createDate: Date;
}
