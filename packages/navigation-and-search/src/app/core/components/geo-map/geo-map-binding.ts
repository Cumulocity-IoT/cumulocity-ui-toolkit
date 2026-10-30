import type { GeoMapBinding, GeoMapFormat, GeoMapItem } from './geo-map.types';

/** Resolve a dot-path binding against an item. `undefined` when any segment is missing. */
export function resolveBinding(item: GeoMapItem, binding: GeoMapBinding | undefined): unknown {
  if (!binding) return undefined;
  let value: unknown = item;

  for (const segment of binding.split('.')) {
    if (value == null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[segment];
  }

  return value;
}

/**
 * Format a resolved value for display. Missing values render as a muted "—"
 * (the popup layout is config-driven and must not shift between items).
 */
export function formatValue(value: unknown, format?: GeoMapFormat): string {
  if (value == null || value === '') return '—';

  switch (format) {
    case 'number:0':
    case 'number:1':

    // falls through
    case 'number:2': {
      const digits = Number(format.slice(-1));
      const n = Number(value);
      return Number.isFinite(n)
        ? n.toLocaleString(undefined, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          })
        : '—';
    }

    case 'percent': {
      const n = Number(value);
      return Number.isFinite(n)
        ? `${(n * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })} %`
        : '—';
    }

    case 'datetime': {
      const d = new Date(value as string | number | Date);
      return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
    }

    case 'relative-time': {
      const d = new Date(value as string | number | Date);

      if (Number.isNaN(d.getTime())) return '—';
      const seconds = Math.round((d.getTime() - Date.now()) / 1000);
      const table: [Intl.RelativeTimeFormatUnit, number][] = [
        ['year', 31536000],
        ['month', 2592000],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
        ['second', 1],
      ];
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

      for (const [unit, size] of table) {
        if (Math.abs(seconds) >= size || unit === 'second') {
          return rtf.format(Math.round(seconds / size), unit);
        }
      }

      return '—';
    }
    default:
      if (isScalar(value)) return String(value);

      return typeof value === 'object' ? JSON.stringify(value) : '—';
  }
}

/** Scalars `String()` renders meaningfully (objects are handled separately by callers). */
function isScalar(value: unknown): value is string | number | boolean | bigint {
  const kind = typeof value;
  return kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint';
}
