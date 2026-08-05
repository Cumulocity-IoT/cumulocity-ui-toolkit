import { IMeasurement } from '@c8y/client';
import { get } from 'lodash';

/** Measurement properties that are metadata, not measurement fragments. */
const NON_FRAGMENT_KEYS = ['id', 'type', 'time', 'self', 'source'];

/**
 * Detects the `<fragment>.<series>` paths of all measurement values on a measurement.
 *
 * A series is anything that carries a `value` property, e.g. for
 * `{ c8y_Temperature: { T: { value: 21, unit: '°C' } } }` this returns
 * `['c8y_Temperature.T']`.
 */
export function detectMeasurementPaths(m: IMeasurement): string[] {
  const result: string[] = [];
  const fragmentCandidates = Object.keys(m).filter((key) => !NON_FRAGMENT_KEYS.includes(key));

  for (const key of fragmentCandidates) {
    const fragment = get(m, key) as Record<string, unknown> | null | undefined;

    if (!fragment || typeof fragment !== 'object') {
      continue;
    }

    for (const nestedKey of Object.keys(fragment)) {
      const series = fragment[nestedKey];

      if (series && typeof series === 'object' && Object.hasOwn(series, 'value')) {
        result.push(`${key}.${nestedKey}`);
      }
    }
  }

  return result;
}
