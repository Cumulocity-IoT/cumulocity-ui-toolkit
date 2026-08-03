import { Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CoreModule } from '@c8y/ngx-components';
import { BaseChartDirective } from 'ng2-charts';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { ActivatedRoute, ActivatedRouteSnapshot } from '@angular/router';
import { IManagedObject, InventoryService, IResultList, Paging } from '@c8y/client';
import { ChartConfiguration, ChartData, ChartTypeRegistry, TooltipItem } from 'chart.js';
import { cloneDeep, flatMap, orderBy } from 'lodash';
import { KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG } from '../../models/kpi-aggregator-widget.const';
import {
  KpiAggregatorWidgetConfig,
  KpiAggregatorWidgetDisplay,
  KpiAggregatorWidgetOrder,
} from '../../models/kpi-aggregator-widget.model';

interface AssetGroup {
  key: string;
  label: string;
  value: number | string;
  objects: IManagedObject[];
}

@Component({
  selector: 'c8y-kpi-aggregator-widget',
  templateUrl: './kpi-aggregator-widget.component.html',
  styleUrls: ['./kpi-aggregator-widget.component.less'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CoreModule,
    BaseChartDirective,
    TooltipModule,
    BsDropdownModule,
  ],
})
export class KpiAggregatorWidgetComponent implements OnInit {
  private activatedRoute = inject(ActivatedRoute);
  private inventoryService = inject(InventoryService);

  @Input() config: KpiAggregatorWidgetConfig = cloneDeep(KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG);

  readonly displayMode = KpiAggregatorWidgetDisplay;

  loading = false;
  asset!: IManagedObject;
  assetGroups?: AssetGroup[];
  max = 0;
  total = 0;
  results = 0;
  paging!: Paging<IManagedObject>;
  pageLimit = 0;
  aggreagtedValue = 0;

  // pie chart
  pieChartData?: ChartData<'pie', number[], string | string[]>;
  pieChartOptions: ChartConfiguration['options'] = {
    plugins: {
      legend: {
        display: true,
        position: undefined,
      },
      tooltip: {
        callbacks: {
          label: (context) => this.generatePieChartLabel(context),
        },
      },
    },
  };

  // benchmarking
  timestampEnd!: Date;
  timestampStart!: Date;
  duration?: string;

  private rawAssets!: IManagedObject[];

  ngOnInit(): void {
    const asset = this.getAssetFromContext(this.activatedRoute.snapshot);

    if (asset) this.asset = asset;

    this.config.pageLimit =
      typeof this.config.pageLimit !== 'number' || this.config.pageLimit <= 0
        ? 10000
        : this.config.pageLimit;
    this.pieChartOptions.plugins.legend.position = this.config.chartLegendPosition || 'top';

    if (this.config.runOnLoad) {
      void this.loadData();
    }
  }

  async loadData(): Promise<void> {
    this.loading = true;
    this.timestampStart = new Date();

    // first page and paging
    const response = await this.loadPageOne();
    let assets: IManagedObject[];

    if (!response) {
      this.loading = false;

      return;
    }

    // further pages
    if (response.limit > 1)
      assets =
        this.config.parallelRequests > 1
          ? await this.loadDataParallel(response.limit, response.assets)
          : await this.loadDataSequentially(response.limit, response.assets);
    else assets = response.assets;

    this.pageLimit = response.limit;
    this.handleRawAssets(assets);

    this.timestampEnd = new Date();
    this.duration = this.calcQueryDuration();
    this.loading = false;
  }

  async loadNextBatch(): Promise<void> {
    if (
      this.paging.totalPages &&
      this.paging.currentPage &&
      this.paging.totalPages <= this.paging.currentPage
    )
      return;

    const limit = this.getNextBatchLimit();

    this.loading = true;
    this.timestampStart = new Date();

    const assets =
      this.config.parallelRequests > 1
        ? await this.loadDataParallel(limit, this.rawAssets)
        : await this.loadDataSequentially(limit, this.rawAssets);

    this.pageLimit = limit;
    this.handleRawAssets(assets);

    this.timestampEnd = new Date();
    this.duration = this.calcQueryDuration();
    this.loading = false;
  }

  // display: aggregated
  private digestAggregatedAssets(assets: IManagedObject[]): AssetGroup[] {
    let groups: AssetGroup[] = [];
    let key: string;
    let group: AssetGroup;
    let value: number;
    let total = 0;

    assets.forEach((asset) => {
      key = this.getKeyFromAsset(asset);
      group = groups.find((g) => g.key === key);

      if (!key) return;

      const rawValue = this.getPathData<unknown>(asset, this.config.kpiFragment);
      const parsedValue = this.toNumber(rawValue);

      if (parsedValue === null) {
        return;
      }

      value = parsedValue;
      total += value;

      if (group) {
        group.objects.push(asset);

        group.value = (group.value as number) + value;
      } else {
        groups.push({
          key,
          label: this.getPathData<string>(asset, this.config.label),
          value,
          objects: [asset],
        });
      }
    });

    // If no numeric KPI values can be extracted, gracefully fall back to counting
    // so the widget still renders useful grouped results instead of an empty view.
    if (groups.length === 0 && assets.length > 0) {
      return this.digestCountedAssets(assets);
    }

    this.total = total;

    // sort
    groups = orderBy(groups, this.config.sort);
    if (this.config.order === KpiAggregatorWidgetOrder.desc) groups.reverse();

    return groups;
  }

  // display: counted
  private digestCountedAssets(assets: IManagedObject[]): AssetGroup[] {
    let groups: AssetGroup[] = [];
    let key: string;
    let group: AssetGroup;
    let value: number | string;
    let total = 0;

    assets.forEach((asset) => {
      key = this.getKeyFromAsset(asset);
      group = groups.find((g) => g.key === key);

      if (!key) return;

      value = this.getPathData<string>(asset, this.config.kpiFragment);
      total += 1;

      if (group) {
        group.objects.push(asset);
        group.value = (group.value as number) + 1;
      } else {
        groups.push({
          key,
          label: value,
          value: 1,
          objects: [asset],
        });
      }
    });

    this.total = total;

    // sort
    groups = orderBy(groups, this.config.sort);
    if (this.config.order === KpiAggregatorWidgetOrder.desc) groups.reverse();

    return groups;
  }

  // display: listed
  private digestListedAssets(assets: IManagedObject[]): AssetGroup[] {
    const groups: AssetGroup[] = [];
    let key: string;
    let group: AssetGroup;
    let total = 0;

    assets.forEach((asset) => {
      key = this.getKeyFromAsset(asset);
      group = groups.find((g) => g.key === key);
      total += 1;

      if (group) {
        group.objects.push(asset);
        group.value = (group.value as number) + 1;
      } else {
        groups.push({
          key,
          label: '',
          value: 1,
          objects: [asset],
        });
      }
    });

    this.total = total;

    // sort
    const sorted = orderBy(groups[0].objects, (object) => this.getAssetNameSortKey(object));

    groups[0].objects =
      this.config.order === KpiAggregatorWidgetOrder.desc ? sorted.reverse() : sorted;

    return groups;
  }

  private getAssetNameSortKey(object: IManagedObject): string {
    const value: unknown = object.name;

    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  private handleRawAssets(assets: IManagedObject[]) {
    this.rawAssets = assets;
    this.assetGroups = this.digestAssets(assets);

    // data
    switch (this.config.display) {
      case KpiAggregatorWidgetDisplay.list:
        break;
      case KpiAggregatorWidgetDisplay.pieAggregate:
      case KpiAggregatorWidgetDisplay.pieCount:
        this.pieChartData = this.convertDataForPieChart(this.assetGroups);
        break;
    }

    this.setMinMax(this.assetGroups);
  }

  private async loadDataSequentially(
    limit: number,
    assets: IManagedObject[]
  ): Promise<IManagedObject[]> {
    if (limit < 2) return assets;

    for (let page = this.paging.currentPage + 1; page <= limit; page++) {
      assets = [...assets, ...(await this.fetchAssets(page)).data];
      this.paging.currentPage = page;
      this.results = assets.length;
    }

    return assets;
  }

  private async loadDataParallel(
    limit: number,
    assets: IManagedObject[]
  ): Promise<IManagedObject[]> {
    if (limit < 2) return assets;

    let requests: Promise<IManagedObject[]>[] = [];

    for (let page = this.paging.currentPage + 1; page <= limit; page++) {
      requests.push(this.fetchAssets(page).then((r) => r.data));

      if ((page - 1) % this.config.parallelRequests === 0 || page === limit) {
        const responses = await Promise.all(requests);

        assets = [...assets, ...flatMap(responses)];
        this.results = assets.length;
        this.paging.currentPage = page;
        requests = [];
      }
    }

    return assets;
  }

  private async loadPageOne(): Promise<{
    limit: number;
    assets: IManagedObject[];
  } | null> {
    // first page and paging
    const response = await this.fetchAssets();

    if (!response) return null;

    const assets = response.data;
    const limit =
      response.paging && this.config.pageLimit > response.paging.totalPages
        ? response.paging.totalPages
        : this.config.pageLimit;

    if (response.paging) this.paging = response.paging;
    this.paging.currentPage = 1;
    this.results = assets.length;

    return { limit, assets };
  }

  private async fetchAssets(page = 1): Promise<IResultList<IManagedObject> | null> {
    let response: IResultList<IManagedObject>;

    try {
      response = await this.inventoryService.list({
        query: this.buildQuery(),
        pageSize: this.config.pageSize,
        currentPage: page,
        withTotalPages: page === 1,
      });
    } catch (error) {
      console.error('fetchAssets', error);

      throw new Error(`Could not complete query for page ${page}`);
    }
    if (!response || !response.data.length) return null;

    return response;
  }

  /**
   * Resolves bracket-enclosed field references in `config.query` against the
   * current `asset` managed object.  For example, a query containing `[type]`
   * is replaced with the asset's actual `type` value before being submitted.
   * Returns the query wrapped in a `$filter=` prefix as required by the C8Y
   * inventory API.
   */
  private buildQuery(): string {
    let query = this.config.query;
    let replacement;
    const match = query.match(/\[([\w.]{1,})\]/i);

    if (this.asset && match) {
      match.forEach((m) => {
        replacement = this.getPathData<string>(this.asset, m);

        if (replacement) {
          query = query.replace(`[${m}]`, replacement as string);
        }
      });
    }

    return `$filter=${query}`;
  }

  private digestAssets(assets: IManagedObject[]): AssetGroup[] {
    if (!assets || !assets.length) {
      console.error('no assets provided');

      return [];
    }

    switch (this.config.display) {
      case KpiAggregatorWidgetDisplay.pieAggregate:
      case KpiAggregatorWidgetDisplay.aggregate:
        return this.digestAggregatedAssets(assets);
      case KpiAggregatorWidgetDisplay.pieCount:
      case KpiAggregatorWidgetDisplay.count:
        return this.digestCountedAssets(assets);
      case KpiAggregatorWidgetDisplay.list:
        return this.digestListedAssets(assets);
      default:
        console.error('Unsupported display option.');

        return [];
    }
  }

  /**
   * Traverses a dot-separated `path` through `o` and returns the leaf value,
   * or `null` if any segment is missing or the leaf is itself an object
   * (which would be ambiguous for numeric KPI comparisons).
   *
   * @example getPathData(asset, 'c8y_Hardware.serialNumber') // => '12345'
   */
  private getPathData<T>(o: object, path: string): T | null {
    const pathPartials = path.split('.');
    let data: unknown = o;

    for (const p of pathPartials) {
      if (data && Object.hasOwn(data as object, p)) {
        data = (data as Record<string, unknown>)[p];
      } else {
        return null;
      }
    }

    if (typeof data === 'object') {
      return null;
    }

    return data as T;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (!trimmed) {
        return null;
      }

      const parsed = Number(trimmed);

      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  /**
   * Returns the grouping key for `asset` by reading `config.groupBy` via
   * {@link getPathData}.  Falls back to the string `'undefined'` when
   * `config.groupBy` is empty so assets without a group key still form a
   * single catch-all bucket.
   */
  private getKeyFromAsset(asset: IManagedObject): string {
    return !!this.config.groupBy && this.config.groupBy !== ''
      ? this.getPathData<string>(asset, this.config.groupBy)?.toString()
      : 'undefined';
  }

  /**
   * Iterates over all groups and computes `this.max` (the single highest group
   * value) and `this.aggreagtedValue` (the sum of all group values).  Both are
   * used by the template and the pie-chart tooltip.
   */
  private setMinMax(groups: AssetGroup[]) {
    let max = 0;
    let aggreagtedValue = 0;
    let value: number;

    groups.forEach((group) => {
      value = group.value as number;
      aggreagtedValue += value;

      if (value > max) {
        max = value;
      }
    });

    this.aggreagtedValue = aggreagtedValue;
    this.max = max;
  }

  /**
   * Returns the elapsed query time as a `"mm:ss.mmm"` string derived from
   * `timestampStart` and `timestampEnd`.  Used for the developer meta panel.
   */
  private calcQueryDuration(): string {
    let milliseconds = this.timestampEnd.getTime() - this.timestampStart.getTime();
    let seconds = Math.floor(milliseconds / 1000);
    let minutes = Math.floor(seconds / 60);

    seconds = seconds % 60;
    minutes = minutes % 60;
    milliseconds = milliseconds % 1000;

    return `${this.padNumber(minutes)}:${this.padNumber(
      seconds
    )}.${this.padNumber(milliseconds, 3)}`;
  }

  /**
   * Left-pads `num` with zeros to `padding` characters (default 2).
   * Used exclusively by {@link calcQueryDuration}.
   */
  private padNumber(num: number, padding = 2): string {
    return num.toString().padStart(padding, '0');
  }

  private getAssetFromContext(
    route: ActivatedRouteSnapshot,
    numberOfCheckedParents = 0
  ): IManagedObject | undefined {
    let context: { contextData: IManagedObject } | undefined = undefined;

    if (route?.data['contextData']) {
      context = route.data as {
        contextData: IManagedObject;
      };
    } else if (route?.firstChild?.data['contextData']) {
      context = route.firstChild.data as {
        contextData: IManagedObject;
      };
    }

    if (context?.contextData) {
      return cloneDeep(context.contextData);
    }

    return route.parent && numberOfCheckedParents < 3
      ? this.getAssetFromContext(route.parent, numberOfCheckedParents + 1)
      : undefined;
  }

  private convertDataForPieChart(
    assetGroups: AssetGroup[]
  ): ChartData<'pie', number[], string | string[]> {
    const labels: string | string[] = [];
    const data: number[] = [];

    assetGroups.forEach((ag) => {
      labels.push(ag.key);
      data.push(typeof ag.value === 'number' ? ag.value : parseInt(ag.value));
    });

    return {
      labels,
      datasets: [
        {
          data,
        },
      ],
    };
  }

  private getNextBatchLimit(): number {
    if (this.paging.totalPages <= this.paging.currentPage)
      throw new Error('No further pages available.');
    if (this.config.parallelRequests === 1) return this.paging.currentPage + 1;

    const limit = this.paging.currentPage + this.config.parallelRequests;

    return limit < this.paging.totalPages ? limit : this.paging.totalPages;
  }

  /**
   * Renders the Chart.js tooltip label for pie slices.
   * When `config.percent` is `true` the label shows the percentage of the
   * aggregated total; otherwise the raw formatted value is returned.
   */
  private generatePieChartLabel(context: TooltipItem<keyof ChartTypeRegistry>): string {
    const percent = Math.round((context.parsed / this.aggreagtedValue) * 1000) / 10;

    return this.config.percent ? `${percent}% (${context.formattedValue})` : context.formattedValue;
  }
}
