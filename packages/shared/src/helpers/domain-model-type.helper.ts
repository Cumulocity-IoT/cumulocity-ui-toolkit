import { IMeasurementValue, IOperation } from '@c8y/client';
import { IMeasurement } from '@c8y/client';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isToCreateIOperation(obj?: unknown): obj is IOperation {
  return typeof obj === 'object' && obj !== null && 'deviceId' in obj && !('id' in obj);
}

function isMeasurementValue(value: unknown): value is IMeasurementValue {
  return isObject(value) && typeof value.value === 'number';
}

export function isMeasurement(value: unknown): value is IMeasurement {
  if (!isObject(value)) return false;

  // Required base fields
  if (
    !('id' in value) ||
    !(typeof value.id === 'string' || typeof value.id === 'number') ||
    typeof value.type !== 'string' ||
    typeof value.time !== 'string' ||
    typeof value.self !== 'string' ||
    !isObject(value.source)
  ) {
    return false;
  }

  // Look for at least ONE fragment containing ONE MeasurementValue
  for (const key of Object.keys(value)) {
    // skip known base properties
    if (['id', 'type', 'time', 'self', 'source'].includes(key)) {
      continue;
    }

    const fragment = value[key];

    if (!isObject(fragment)) continue;

    for (const series of Object.values(fragment)) {
      if (isMeasurementValue(series)) {
        return true; // ✅ found at least one valid fragment+series
      }
    }
  }

  return false;
}
