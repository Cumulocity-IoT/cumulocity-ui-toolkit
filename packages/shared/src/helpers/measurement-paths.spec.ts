import { IMeasurement } from '@c8y/client';
import { detectMeasurementPaths } from './measurement-paths';

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

describe('detectMeasurementPaths', () => {
  it('detects a single fragment.series path', () => {
    const m = measurement({ c8y_Temperature: { T: { value: 21, unit: '°C' } } });

    expect(detectMeasurementPaths(m)).toEqual(['c8y_Temperature.T']);
  });

  it('detects multiple series across multiple fragments', () => {
    const m = measurement({
      c8y_Temperature: { T: { value: 21 }, T2: { value: 22 } },
      c8y_Humidity: { H: { value: 50 } },
    });

    expect(detectMeasurementPaths(m)).toEqual([
      'c8y_Temperature.T',
      'c8y_Temperature.T2',
      'c8y_Humidity.H',
    ]);
  });

  it('ignores the measurement metadata properties', () => {
    expect(detectMeasurementPaths(measurement({}))).toEqual([]);
  });

  it('ignores series without a value property', () => {
    const m = measurement({ c8y_Broken: { S: { unit: '°C' } } });

    expect(detectMeasurementPaths(m)).toEqual([]);
  });

  it('detects a value of zero', () => {
    const m = measurement({ c8y_Temperature: { T: { value: 0 } } });

    expect(detectMeasurementPaths(m)).toEqual(['c8y_Temperature.T']);
  });

  it('tolerates null and primitive fragments', () => {
    const m = measurement({ nullish: null, primitive: 5, c8y_Ok: { S: { value: 1 } } });

    expect(detectMeasurementPaths(m)).toEqual(['c8y_Ok.S']);
  });
});
