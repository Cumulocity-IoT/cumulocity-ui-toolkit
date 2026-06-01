import { IMeasurement } from '@c8y/client';
import { v4 as uuidv4 } from 'uuid';
import { mockListResponse } from './list-response.factory';

export interface MeasurementOverrides {
  /** Scalar value for the default c8y_Temperature.T series */
  value?: number;
  /** Timestamp for the measurement (overrides default `new Date()`) */
  time?: Date;
}

/**
 * Returns a minimal valid IMeasurement. The default fragment is
 * `c8y_Temperature.T` so the type-guard in `mockListResponse` can detect it.
 * Pass `overrides` to set the scalar value or timestamp, and `parts` to
 * override any other IMeasurement field.
 */
export function createMeasurement(
  overrides?: MeasurementOverrides & Omit<Partial<IMeasurement>, 'time'>
): IMeasurement {
  const { value, time, ...rest } = overrides ?? {};
  const base: IMeasurement = {
    id: uuidv4() as string,
    self: '',
    source: { id: '', self: '' },
    time: (time ?? new Date()).toISOString(),
    type: 'c8y_CypressType',
    c8y_Temperature: {
      T: {
        value: value ?? Math.floor(Math.random() * 10),
        unit: '°C',
      },
    },
  };
  return { ...base, ...rest };
}

/** Alias for {@link createMeasurement}. */
export function mockMeasurement(parts?: Omit<Partial<IMeasurement>, 'time'>): IMeasurement {
  return createMeasurement(parts);
}

/**
 * Generates `count` measurements spread backwards in time from now by
 * `intervalInSecs` seconds each, then wraps them in a `mockListResponse`.
 */
export function mockMeasurementsResponse(count: number, intervalInSecs: number): object {
  const measurements: IMeasurement[] = [];
  let timestamp = Date.now();

  for (let i = 0; i < count; i++) {
    const value = Math.floor(Math.random() * 10);
    measurements.push(createMeasurement({ value, time: new Date(timestamp) }));
    timestamp -= intervalInSecs * 1000;
  }

  return mockListResponse(measurements, {
    currentPage: 1,
    pageSize: 2000,
    totalPages: Math.floor(count / 2000),
  });
}
