import { Component, computed, Input, OnInit, Optional, signal } from '@angular/core';
import { IAlarm, IEvent, IManagedObject, InventoryService } from '@c8y/client';
import { ContextRouteService, DynamicComponent, DynamicComponentAlertAggregator, GlobalTimeContextWidgetConfig, OnBeforeSave, ViewContext } from '@c8y/ngx-components';
import { AssetSelectorOptions } from '@c8y/ngx-components/assets-navigator';
import { KPIDetails } from '@c8y/ngx-components/datapoint-selector';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { WidgetConfigComponent } from '@c8y/ngx-components/context-dashboard';
import { LineChartWidgetConfig, ThresholdConfig } from './ps-line-chart.model';

@Component({
  templateUrl: './dynamic-aggregation-line-chart-config.component.html',
})
export class DynamicAggregationLineChartConfigComponent implements DynamicComponent, OnBeforeSave, OnInit {
  @Input() config: GlobalTimeContextWidgetConfig & Partial<LineChartWidgetConfig> = {};
  isTalkingClaude = false;

  /** Available Cumulocity aggregation functions. */
  readonly aggregationOptions = [
    'min',
    'max',
    'avg',
    'sum',
    'count',
    'stdDevPop',
    'stdDevSamp',
  ];

  /** Asset selector config — devices only. */
  readonly selectorConfig: AssetSelectorOptions = {
    groupsOnly: false,
    groupsSelectable: false,
    search: true,
    label: 'Select device',
  };

  /** Starting point for the asset selector hierarchy. */
  readonly rootAsset = signal<Partial<IManagedObject> | undefined>(undefined);

  /** Currently selected device in the asset selector. */
  selectedDevice!: IManagedObject;

  /** Datapoints configured for the selected device. */
  readonly datapoints = signal<KPIDetails[]>([]);

  readonly aggregationFunctions = signal<string[]>(['min', 'avg', 'max']);

  readonly thresholdConfigs = signal<Record<string, ThresholdConfig>>({});

  private data: IManagedObject[] | IEvent[] | IAlarm[] = [];
  sampleData?: IManagedObject[] | IEvent[] | IAlarm[];
  mappedData: any[] = [];
  error = '';

  alerts?: DynamicComponentAlertAggregator | undefined;
  ng1FormRef?: any;
  contextSourceId?: string | number | null;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly contextRouteService: ContextRouteService,
    @Optional() private widgetComponent: WidgetConfigComponent
  ) { }

  async ngOnInit(): Promise<void> {
    const functions = this.config?.aggregationFunctions;
    if (Array.isArray(functions) && functions.length > 0) {
      this.aggregationFunctions.set(functions);
    }

    const thresholds = this.config?.thresholdConfigs;
    if (thresholds) {
      this.thresholdConfigs.set(thresholds);
    }

    const savedDatapoints = this.config?.datapoints;
    if (Array.isArray(savedDatapoints) && savedDatapoints.length > 0) {
      this.datapoints.set(savedDatapoints);
    }

    const savedDevice = this.config?.device;
    if (savedDevice) {
      this.selectedDevice = savedDevice;
      this.rootAsset.set(savedDevice);
    }

    this.contextSourceId = this.initializeContextSourceId();
    const context = this.widgetComponent?.context as IManagedObject | undefined;
    if (context?.id) {
      this.rootAsset.set(context);
      if (!this.selectedDevice && 'c8y_IsDevice' in context) {
        this.selectedDevice = context;
      }
    }
  }

  private initializeContextSourceId(): number | string | null {
    const routeContext = this.contextRouteService.getContextData(this.activatedRoute);
    if (routeContext) {
      const { context, contextData } = routeContext;
      if ([ViewContext.Device, ViewContext.Group].includes(context)) {
        return contextData?.id ?? null;
      }
    }

    return null;
  }

  onAssetSelected(event: any): void {
    const item = Array.isArray(event?.items) ? event.items[0] : event?.items;
    this.selectedDevice = item;
    this.datapoints.set([]);
  }

  readonly filteredDatapoints = computed(() => this.datapoints().filter(dp => dp.__active !== false));

  removeDatapoint(dp: KPIDetails): void {
    this.datapoints.set(this.datapoints().filter(d => d !== dp));
  }

  updateThresholdConfig(key: string, patch: Partial<ThresholdConfig>): void {
    const defaults: ThresholdConfig = { showMin: false, minColor: '#ff4444', showMax: false, maxColor: '#4444ff' };
    this.thresholdConfigs.update(cfg => ({
      ...cfg,
      [key]: { ...defaults, ...cfg[key], ...patch },
    }));
  }

  onBeforeSave(config?: GlobalTimeContextWidgetConfig & Partial<LineChartWidgetConfig>): boolean | Promise<boolean> | Observable<boolean> {
    if (!config) { return true; }
    config.widgetInstanceGlobalTimeContext = true;
    config.canDecoupleGlobalTimeContext = true;
    config.aggregationFunctions = this.aggregationFunctions();
    config.datapoints = this.datapoints();
    config.device = this.selectedDevice;
    config.thresholdConfigs = this.thresholdConfigs();
    return true;
  }
}
