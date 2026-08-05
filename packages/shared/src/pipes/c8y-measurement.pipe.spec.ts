import { TestBed } from '@angular/core/testing';
import { IMeasurement } from '@c8y/client';
import { NumberPipe } from '@c8y/ngx-components';
import { C8yMeasurementPipe } from './c8y-measurement.pipe';

function measurement(fragments: Record<string, unknown>): IMeasurement {
  return {
    id: '1',
    type: 'c8y_Test',
    time: '2026-01-01T00:00:00.000Z',
    self: 'https://example/measurement/1',
    source: { id: '42' },
    ...fragments,
  };
}

describe('C8yMeasurementPipe', () => {
  let pipe: C8yMeasurementPipe;
  // `NumberPipe.transform` is overloaded, so the spy is held untyped to keep the
  // stub and the assertions readable.
  let transformSpy: jasmine.Spy;

  beforeEach(() => {
    transformSpy = jasmine
      .createSpy('transform')
      .and.callFake((value: unknown) => `${String(value)}`);

    TestBed.configureTestingModule({
      providers: [
        C8yMeasurementPipe,
        { provide: NumberPipe, useValue: { transform: transformSpy } },
      ],
    });

    pipe = TestBed.inject(C8yMeasurementPipe);
  });

  it('renders value and unit for a single measurement', () => {
    const result = pipe.transform(
      measurement({ c8y_Temperature: { T: { value: 21, unit: '°C' } } })
    );

    expect(result).toBe('21 °C');
  });

  it('renders the value alone when no unit is present', () => {
    expect(pipe.transform(measurement({ c8y_Temperature: { T: { value: 21 } } }))).toBe('21');
  });

  it('passes rounding and digits info through to the NumberPipe', () => {
    pipe.transform(measurement({ c8y_Temperature: { T: { value: 21.456 } } }), 'floor', '1.0-1');

    expect(transformSpy).toHaveBeenCalledWith(21.456, 'floor', '1.0-1');
  });

  it('does not run non-numeric values through the NumberPipe', () => {
    const result = pipe.transform(measurement({ c8y_State: { S: { value: 'OPEN' } } }));

    expect(result).toBe('OPEN');
    expect(transformSpy).not.toHaveBeenCalled();
  });

  it('reports when multiple measurements are present', () => {
    const m = measurement({ c8y_Temperature: { T: { value: 1 }, T2: { value: 2 } } });

    expect(pipe.transform(m)).toBe('Found multiple measurements (2).');
  });

  it('returns a dash for a missing measurement', () => {
    expect(pipe.transform(null as unknown as IMeasurement)).toBe('-');
  });

  it('returns a dash when no measurement fragment is present', () => {
    expect(pipe.transform(measurement({}))).toBe('-');
  });
});
