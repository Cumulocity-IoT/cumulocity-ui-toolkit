import { TestBed } from '@angular/core/testing';
import { input } from '@angular/core';
import { KpiAggregatorWidgetComponent } from './kpi-aggregator-widget.component';
import { InventoryService, IManagedObject, IResultList, Paging } from '@c8y/client';
import { ActivatedRoute } from '@angular/router';
import { ChartData } from 'chart.js';
import { KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG } from '../../models/kpi-aggregator-widget.const';
import { KpiAggregatorWidgetOrder } from '../../models/kpi-aggregator-widget.model';

describe('KpiAggregatorWidgetComponent', () => {
  let component: KpiAggregatorWidgetComponent;
  let inventoryServiceSpy: jasmine.SpyObj<InventoryService>;

  beforeEach(async () => {
    inventoryServiceSpy = jasmine.createSpyObj<InventoryService>('InventoryService', ['list']);

    await TestBed.configureTestingModule({
      providers: [
        { provide: InventoryService, useValue: inventoryServiceSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
      ],
    }).compileComponents();

    component = TestBed.runInInjectionContext(() => new KpiAggregatorWidgetComponent());

    // Ensure config signal exists and is replaceable for tests
    TestBed.runInInjectionContext(() => {
      (component as unknown as { config: ReturnType<typeof input> }).config = input({
        ...KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG,
      });
    });
  });

  it('0 should create the component instance', () => {
    expect(component).toBeTruthy();
  });

  it('1 should initialize default config from constant', () => {
    expect(component.config()).toEqual(
      jasmine.objectContaining(KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG)
    );
  });

  it('2 should resolve nested object path correctly', () => {
    const obj = { a: { b: { c: 42 } } };
    const result = component['getPathData']<number>(obj, 'a.b.c');

    expect(result).toBe(42);
  });

  it('3 should return null for invalid path', () => {
    const obj = { a: { b: {} } };
    const result = component['getPathData']<number>(obj, 'a.b.x');

    expect(result).toBeNull();
  });

  it('4 should compute correct key from asset', () => {
    const asset = { c8y_Device: { type: 'Sensor' } } as unknown as IManagedObject;

    TestBed.runInInjectionContext(() => {
      (component as unknown as { config: ReturnType<typeof input> }).config = input({
        ...KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG,
        groupBy: 'c8y_Device.type',
      });
    });

    const key = component['getKeyFromAsset'](asset);

    expect(key).toBe('Sensor');
  });

  it('5 should compute aggregated asset groups correctly', () => {
    TestBed.runInInjectionContext(() => {
      (component as unknown as { config: ReturnType<typeof input> }).config = input({
        ...KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG,
        groupBy: 'type',
        kpiFragment: 'c8y_Temp.value',
        order: KpiAggregatorWidgetOrder.asc,
      });
    });

    const assets = [
      { type: 'A', c8y_Temp: { value: 10 } },
      { type: 'A', c8y_Temp: { value: 5 } },
      { type: 'B', c8y_Temp: { value: 7 } },
    ] as unknown as IManagedObject[];

    const result = component['digestAggregatedAssets'](assets);

    expect(result.length).toBe(2);
    expect(result.find((r) => r.key === 'A')?.value).toBe(15);
    expect(result.find((r) => r.key === 'B')?.value).toBe(7);
    expect(component.total).toBe(22);
  });

  it('6 should generate correct pie chart data', () => {
    const groups = [
      { key: 'A', label: 'A', value: 5, objects: [] },
      { key: 'B', label: 'B', value: 10, objects: [] },
    ];
    const data: ChartData<'pie', number[], string | string[]> =
      component['convertDataForPieChart'](groups);

    expect(data.labels).toEqual(['A', 'B']);
    expect(data.datasets[0].data).toEqual([5, 10]);
  });

  it('7 should generate pie chart label with percentage when enabled', () => {
    component.aggreagtedValue = 200;
    TestBed.runInInjectionContext(() => {
      (component as unknown as { config: ReturnType<typeof input> }).config = input({
        ...KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG,
        percent: true,
      });
    });

    const context = {
      parsed: 50,
      formattedValue: '50',
    } as unknown as Parameters<(typeof component)['generatePieChartLabel']>[0];

    const label = component['generatePieChartLabel'](context);

    expect(label).toContain('%');
    expect(label).toContain('50');
  });

  it('8 should load data and populate assetGroups', async () => {
    // Simplify by stubbing the private fetchAssets method directly
    const mockAssets = [
      { id: '1', name: 'Device 1', type: 'A' },
      { id: '2', name: 'Device 2', type: 'B' },
    ] as unknown as IManagedObject[];

    spyOn(component as any, 'fetchAssets').and.resolveTo({
      data: mockAssets,
      res: {} as Response,
      paging: { currentPage: 1, totalPages: 1, pageSize: 2 } as unknown as Paging<IManagedObject>,
    } as IResultList<IManagedObject>);

    await component['loadData']();

    expect(component.fetchAssets).toHaveBeenCalled();
    expect(component.loading()).toBeFalse();
    expect(component.assetGroups?.length).toBeGreaterThan(0);
  });
});
