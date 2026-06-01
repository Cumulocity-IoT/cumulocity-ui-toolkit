import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { InventoryService } from '@c8y/client';
import { provideMock } from '~helpers/auto-mock.helper';
import { KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG } from '../../models/kpi-aggregator-widget.const';
import { KpiAggregatorWidgetComponent } from './kpi-aggregator-widget.component';

/** Minimal ActivatedRoute stub (ngOnInit reads snapshot.data for the asset context). */
const ROUTE_STUB = {
  snapshot: { data: {}, firstChild: null, parent: null },
};

describe('KpiAggregatorWidgetComponent', () => {
  let component: KpiAggregatorWidgetComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [KpiAggregatorWidgetComponent],
      providers: [
        provideMock(InventoryService),
        { provide: ActivatedRoute, useValue: ROUTE_STUB },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).overrideComponent(KpiAggregatorWidgetComponent, {
      // Strip heavy module imports so we can test private methods without
      // pulling in CoreModule, chart libraries, ngx-bootstrap, etc.
      set: { imports: [], template: '' },
    });

    const fixture = TestBed.createComponent(KpiAggregatorWidgetComponent);
    component = fixture.componentInstance;
    // Use default config — no detectChanges() so ngOnInit is not triggered.
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  // ─── getPathData() ───────────────────────────────────────────────────────────

  describe('getPathData()', () => {
    it('returns a top-level primitive value', () => {
      expect((component as any)['getPathData']({ name: 'router-1' }, 'name')).toBe('router-1');
    });

    it('traverses a nested dot-separated path', () => {
      const obj = { c8y_Hardware: { serialNumber: 'SN-42' } };
      expect((component as any)['getPathData'](obj, 'c8y_Hardware.serialNumber')).toBe('SN-42');
    });

    it('returns null when a path segment is missing', () => {
      expect((component as any)['getPathData']({ a: 1 }, 'a.b.c')).toBeNull();
    });

    it('returns null when the resolved value is an object (ambiguous KPI)', () => {
      const obj = { fragment: { nested: {} } };
      expect((component as any)['getPathData'](obj, 'fragment.nested')).toBeNull();
    });

    it('returns a numeric value unchanged', () => {
      expect((component as any)['getPathData']({ count: 0 }, 'count')).toBe(0);
    });
  });

  // ─── padNumber() ─────────────────────────────────────────────────────────────

  describe('padNumber()', () => {
    it('pads a single digit to 2 characters by default', () => {
      expect((component as any)['padNumber'](5)).toBe('05');
    });

    it('leaves a 2-digit number unchanged', () => {
      expect((component as any)['padNumber'](42)).toBe('42');
    });

    it('pads to a custom width', () => {
      expect((component as any)['padNumber'](7, 3)).toBe('007');
    });

    it('handles 0', () => {
      expect((component as any)['padNumber'](0)).toBe('00');
    });
  });

  // ─── calcQueryDuration() ─────────────────────────────────────────────────────

  describe('calcQueryDuration()', () => {
    it('formats mm:ss.mmm correctly', () => {
      component.timestampStart = new Date('2024-01-01T00:00:00.000Z');
      component.timestampEnd = new Date('2024-01-01T00:01:23.456Z');
      expect((component as any)['calcQueryDuration']()).toBe('01:23.456');
    });

    it('formats a sub-second duration', () => {
      component.timestampStart = new Date('2024-01-01T00:00:00.000Z');
      component.timestampEnd = new Date('2024-01-01T00:00:00.042Z');
      expect((component as any)['calcQueryDuration']()).toBe('00:00.042');
    });

    it('formats zero duration', () => {
      const now = new Date();
      component.timestampStart = now;
      component.timestampEnd = now;
      expect((component as any)['calcQueryDuration']()).toBe('00:00.000');
    });
  });

  // ─── buildQuery() ────────────────────────────────────────────────────────────

  describe('buildQuery()', () => {
    it('prepends $filter= to the raw query when no placeholders are present', () => {
      component.config = { ...KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG, query: 'has(type)' };
      expect((component as any)['buildQuery']()).toBe('$filter=has(type)');
    });

    it('replaces a bracket placeholder with the matching asset field value', () => {
      component.config = { ...KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG, query: 'type = "[type]"' };
      component.asset = { type: 'Sensor' } as never;
      const query: string = (component as any)['buildQuery']();
      expect(query).toBe('$filter=type = "Sensor"');
    });

    it('leaves the placeholder unchanged when no asset is set', () => {
      component.config = { ...KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG, query: 'type = "[type]"' };
      component.asset = undefined;
      const query: string = (component as any)['buildQuery']();
      expect(query).toBe('$filter=type = "[type]"');
    });
  });

  // ─── generatePieChartLabel() ─────────────────────────────────────────────────

  describe('generatePieChartLabel()', () => {
    beforeEach(() => {
      component['aggreagtedValue'] = 200;
    });

    it('returns the percentage string when config.percent is true', () => {
      component.config = { ...KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG, percent: true };
      const ctx = { parsed: 50, formattedValue: '50' } as never;
      expect((component as any)['generatePieChartLabel'](ctx)).toBe('25% (50)');
    });

    it('returns the raw formattedValue when config.percent is false', () => {
      component.config = { ...KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG, percent: false };
      const ctx = { parsed: 50, formattedValue: '50' } as never;
      expect((component as any)['generatePieChartLabel'](ctx)).toBe('50');
    });

    it('rounds the percentage to 1 decimal place', () => {
      component['aggreagtedValue'] = 300;
      component.config = { ...KPI_AGGREGAOR_WIDGET__DEFAULT_CONFIG, percent: true };
      const ctx = { parsed: 100, formattedValue: '100' } as never;
      // 100/300 = 33.333… → rounded to 33.3%
      expect((component as any)['generatePieChartLabel'](ctx)).toBe('33.3% (100)');
    });
  });
});
