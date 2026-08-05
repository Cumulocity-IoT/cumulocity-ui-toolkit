import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeasurementService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { provideMock } from '~helpers/auto-mock.helper';
import {
  EnergyWidgetDateDisplayMode,
  EnergyWidgetDateRange,
  EnergyConsumptionWidgetConfig,
} from '../../models/energy-consumption-widget.model';
import { EnergyConsumptionWidgetComponent } from './energy-consumption-widget.component';

/** Minimal widget config required to instantiate the component. */
const BASE_CONFIG: EnergyConsumptionWidgetConfig = {
  device: { id: 'dev-1' },
  defaultRange: EnergyWidgetDateRange.DAY_7,
  type: 'electricity',
  fragment: 'meter',
  series: 'total',
  digits: 2,
  displayMode: EnergyWidgetDateDisplayMode.DELTA,
  beginAtZero: false,
  barColor: '#0099cc',
  rangeType: 'date',
  exposeRangeSelect: false,
};

describe('EnergyConsumptionWidgetComponent', () => {
  let component: EnergyConsumptionWidgetComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EnergyConsumptionWidgetComponent],
      providers: [
        provideMock(MeasurementService),
        provideMock(AlertService),
        provideMock(TranslateService),
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).overrideComponent(EnergyConsumptionWidgetComponent, {
      // Strip heavy imports (CoreModule, BaseChartDirective, etc.) so the
      // component can be instantiated without their providers in test scope.
      set: { imports: [], template: '' },
    });

    const fixture = TestBed.createComponent(EnergyConsumptionWidgetComponent);

    component = fixture.componentInstance;
    component.config = { ...BASE_CONFIG };
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  // ─── getDurationFromRange() ──────────────────────────────────────────────────

  describe('getDurationFromRange()', () => {
    it('parses "7 days"', () => {
      expect((component as any)['getDurationFromRange']('7 days')).toEqual({
        amount: 7,
        unit: 'days',
      });
    });

    it('parses "12 hours"', () => {
      expect((component as any)['getDurationFromRange']('12 hours')).toEqual({
        amount: 12,
        unit: 'hours',
      });
    });

    it('parses "4 weeks"', () => {
      expect((component as any)['getDurationFromRange']('4 weeks')).toEqual({
        amount: 4,
        unit: 'weeks',
      });
    });

    it('parses "12 months"', () => {
      expect((component as any)['getDurationFromRange']('12 months')).toEqual({
        amount: 12,
        unit: 'months',
      });
    });
  });

  // ─── roundValue() ───────────────────────────────────────────────────────────

  describe('roundValue()', () => {
    it('rounds to the config digit count by default', () => {
      component.config.digits = 2;
      expect((component as any)['roundValue'](3.14159)).toBe(3.14);
    });

    it('honours an explicit digit override', () => {
      expect((component as any)['roundValue'](3.14159, 3)).toBe(3.142);
    });

    it('rounds to 0 decimal places', () => {
      expect((component as any)['roundValue'](3.7, 0)).toBe(4);
    });

    it('rounds 0 to 0', () => {
      expect((component as any)['roundValue'](0, 2)).toBe(0);
    });
  });

  // ─── generateMilestones() ───────────────────────────────────────────────────

  describe('generateMilestones()', () => {
    it('returns amount + 1 milestones for a day range', () => {
      const milestones: string[] = (component as any)['generateMilestones']('7 days');

      // 7 period boundaries + 1 "now" timestamp
      expect(milestones.length).toBe(8);
    });

    it('returns amount + 1 milestones for a month range', () => {
      const milestones: string[] = (component as any)['generateMilestones']('12 months');

      expect(milestones.length).toBe(13);
    });

    it('returns amount + 1 milestones for an hour range', () => {
      const milestones: string[] = (component as any)['generateMilestones']('12 hours');

      expect(milestones.length).toBe(13);
    });

    it('returns amount + 1 milestones for a week range', () => {
      const milestones: string[] = (component as any)['generateMilestones']('4 weeks');

      expect(milestones.length).toBe(5);
    });

    it('all entries are valid ISO strings', () => {
      const milestones: string[] = (component as any)['generateMilestones']('3 days');

      milestones.forEach((m) => expect(new Date(m).toString()).not.toBe('Invalid Date'));
    });

    it('returns milestones in ascending chronological order', () => {
      const milestones: string[] = (component as any)['generateMilestones']('7 days');

      for (let i = 1; i < milestones.length; i++) {
        expect(new Date(milestones[i]).getTime()).toBeGreaterThanOrEqual(
          new Date(milestones[i - 1]).getTime()
        );
      }
    });
  });

  // ─── calcValue() ────────────────────────────────────────────────────────────

  describe('calcValue()', () => {
    function makeMeasurement(value: number) {
      return { meter: { total: { value, unit: 'kWh' } } };
    }

    beforeEach(() => {
      component.config.fragment = 'meter';
      component.config.series = 'total';
      component.config.digits = 2;
    });

    it('returns the raw rounded reading in TOTAL mode', () => {
      component.config.displayMode = EnergyWidgetDateDisplayMode.TOTAL;
      const m = makeMeasurement(5.555);

      component['measurements'] = [m] as never;

      expect((component as any)['calcValue'](m, 0)).toBe(5.56);
    });

    it('returns raw reading at index 0 even in DELTA mode (no predecessor)', () => {
      component.config.displayMode = EnergyWidgetDateDisplayMode.DELTA;
      const m = makeMeasurement(100);

      component['measurements'] = [m] as never;

      expect((component as any)['calcValue'](m, 0)).toBe(100);
    });

    it('returns the delta from the preceding measurement in DELTA mode', () => {
      component.config.displayMode = EnergyWidgetDateDisplayMode.DELTA;
      // Use integers to avoid IEEE-754 rounding surprises in the subtraction
      const m0 = makeMeasurement(100);
      const m1 = makeMeasurement(125);

      component['measurements'] = [m0, m1] as never;

      expect((component as any)['calcValue'](m1, 1)).toBe(25);
    });

    it('rounds the delta to config.digits precision', () => {
      component.config.displayMode = EnergyWidgetDateDisplayMode.DELTA;
      component.config.digits = 1;
      const m0 = makeMeasurement(0);
      const m1 = makeMeasurement(1.2);

      component['measurements'] = [m0, m1] as never;

      // delta 1.2 - 0 = 1.2 → rounded to 1 decimal place = 1.2
      expect((component as any)['calcValue'](m1, 1)).toBe(1.2);
    });
  });
});
