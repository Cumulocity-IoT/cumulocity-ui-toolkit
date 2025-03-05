import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute, ActivatedRouteSnapshot } from '@angular/router';
import {
  IManagedObject,
  InventoryService,
  IResultList,
  Paging,
} from '@c8y/client';
import {
  ChartConfiguration,
  ChartData,
  ChartTypeRegistry,
  TooltipItem,
} from 'chart.js';
import { cloneDeep, flatMap, has, orderBy } from 'lodash';
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
})
export class KpiAggregatorWidgetComponent implements OnInit {
  @Input() config: KpiAggregatorWidgetConfig = cloneDeep(
    KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG
  );

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

  private rawAssets!: IManagedObject[];

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

  constructor(
    private activatedRoute: ActivatedRoute,
    private inventoryService: InventoryService
  ) {
    const asset = this.getAssetFromContext(this.activatedRoute.snapshot);

    if (asset) this.asset = asset;
  }

  ngOnInit(): void {
    this.config.pageLimit =
      typeof this.config.pageLimit !== 'number' || this.config.pageLimit <= 0
        ? 10000
        : this.config.pageLimit;
    this.pieChartOptions.plugins.legend.position =
      this.config.chartLegendPosition || 'top';

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

  private async fetchAssets(
    page = 1
  ): Promise<IResultList<IManagedObject> | null> {
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
      throw `Could not complete query for page ${page}`;
    }
    if (!response || !response.data.length) return null;

    return response;
  }

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

  private getPathData<T>(o: object, path: string): T | null {
    const pathPartials = path.split('.');
    let data = o;

    pathPartials.forEach((p) => {
      if (has(data, p)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data = data[p];
      } else {
        return;
      }
    });

    if (typeof data === 'object') {
      return null;
    }

    return data as unknown as T;
  }

  private getKeyFromAsset(asset: IManagedObject): string {
    return !!this.config.groupBy && this.config.groupBy !== ''
      ? this.getPathData<string>(asset, this.config.groupBy)?.toString()
      : 'undefined';
  }

  // display: aggregated
  protected digestAggregatedAssets(assets: IManagedObject[]): AssetGroup[] {
    let groups: AssetGroup[] = [];
    let key: string;
    let group: AssetGroup;
    let value: number | string;
    let total = 0;

    assets.forEach((asset) => {
      key = this.getKeyFromAsset(asset);
      group = groups.find((g) => g.key === key);

      if (!key) return;

      value = this.getPathData<number>(asset, this.config.kpiFragment);
      total += value;

      if (typeof value === 'number') {
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
      }
    });

    this.total = total;

    // sort
    groups = orderBy(groups, this.config.sort);
    if (this.config.order === KpiAggregatorWidgetOrder.desc) groups.reverse();

    return groups;
  }

  // display: counted
  protected digestCountedAssets(assets: IManagedObject[]): AssetGroup[] {
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
          label: value as string,
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
  protected digestListedAssets(assets: IManagedObject[]): AssetGroup[] {
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
    const sorted = orderBy(groups[0].objects, (object) =>
      object['name'].trim().toLowerCase()
    );

    groups[0].objects =
      this.config.order === KpiAggregatorWidgetOrder.desc
        ? sorted.reverse()
        : sorted;

    return groups;
  }

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

  private calcQueryDuration(): string {
    let milliseconds =
      this.timestampEnd.getTime() - this.timestampStart.getTime();
    let seconds = Math.floor(milliseconds / 1000);
    let minutes = Math.floor(seconds / 60);

    seconds = seconds % 60;
    minutes = minutes % 60;
    milliseconds = milliseconds % 1000;

    return `${this.padNumber(minutes)}:${this.padNumber(
      seconds
    )}.${this.padNumber(milliseconds, 3)}`;
  }

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
    let data: number[] = [];

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
      throw 'No further pages available.';
    if (this.config.parallelRequests === 1) return this.paging.currentPage + 1;

    const limit = this.paging.currentPage + this.config.parallelRequests;

    return limit < this.paging.totalPages ? limit : this.paging.totalPages;
  }

  private generatePieChartLabel(
    context: TooltipItem<keyof ChartTypeRegistry>
  ): string {
    const percent =
      Math.round((context.parsed / this.aggreagtedValue) * 1000) / 10;

    return this.config.percent
      ? `${percent}% (${context.formattedValue})`
      : context.formattedValue;
  }
}
