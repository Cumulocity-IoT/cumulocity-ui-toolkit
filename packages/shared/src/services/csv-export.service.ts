import { Injectable } from '@angular/core';

type Primitive = string | number | boolean | null | undefined;

const UTF8_BOM = '\uFEFF';
/** First characters that make spreadsheet applications evaluate a cell (CSV injection). */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

type FlatRow = Record<string, Primitive>;

/**
 * Service for converting data to CSV format and triggering browser downloads.
 *
 * Supports flat objects, deeply-nested objects (flattened with dot-notation keys),
 * primitive arrays, and mixed-type arrays.
 */
@Injectable()
export class CsvExportService {
  /**
   * Converts `data` to CSV and triggers a browser file download.
   * Does nothing when `data` is empty or nullish.
   *
   * @param data Array of objects or primitive values to export.
   * @param filename Base filename without extension. Defaults to `'data'`.
   */
  downloadFile<T extends object | Primitive>(data: T[], filename = 'data'): void {
    if (!data?.length) {
      return;
    }

    const csvContent = this.convertToCsv(data);
    // The byte order mark makes Excel read the file as UTF-8 (umlauts, units like °C).
    const blob = new Blob([UTF8_BOM, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revoked on the next task: some browsers start the download only after the click
    // handler, and a URL revoked synchronously cancels it.
    setTimeout(() => URL.revokeObjectURL(url));
  }

  /**
   * Converts an array of objects or primitives into a CSV string.
   * Each object is first flattened with {@link flattenObject}; primitives are wrapped
   * in a single `value` column.
   */
  private convertToCsv<T extends object | Primitive>(data: T[]): string {
    const flattenedData: FlatRow[] = data.map((item) =>
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? this.flattenObject(item)
        : { value: item as Primitive }
    );

    // Collect all unique headers preserving insertion order.
    const headers = Array.from(
      flattenedData.reduce<Set<string>>((acc, row) => {
        Object.keys(row).forEach((key) => acc.add(key));

        return acc;
      }, new Set<string>())
    );

    return [
      headers.map((header) => this.escapeCsv(header)).join(','),
      ...flattenedData.map((row) => headers.map((field) => this.escapeCsv(row[field])).join(',')),
    ].join('\n');
  }

  /**
   * Recursively flattens a nested object into a single-level record using
   * dot-notation keys. Arrays are JSON-stringified to preserve their structure.
   */
  private flattenObject<T extends object>(obj: T, parentKey = '', result: FlatRow = {}): FlatRow {
    for (const key of Object.keys(obj)) {
      const newKey = parentKey ? `${parentKey}.${key}` : key;
      const value = (obj as Record<string, unknown>)[key];

      if (value instanceof Date) {
        result[newKey] = value.toISOString();
      } else if (Array.isArray(value)) {
        result[newKey] = JSON.stringify(value);
      } else if (value !== null && typeof value === 'object') {
        this.flattenObject(value, newKey, result);
      } else {
        result[newKey] = value as Primitive;
      }
    }

    return result;
  }

  /**
   * Escapes a CSV cell value by wrapping it in double-quotes when it contains
   * commas, double-quotes, or line breaks. Internal double-quotes are doubled per RFC 4180.
   *
   * Text that a spreadsheet would evaluate as a formula (`=`, `+`, `-`, `@`, tab, carriage
   * return first) is prefixed with `'` — names and texts come from devices and users.
   * Numbers are left as they are, so negative values stay numeric.
   */
  private escapeCsv(value: Primitive): string {
    if (value == null) return '';
    let str = String(value);

    if (typeof value === 'string' && FORMULA_TRIGGER.test(str)) {
      str = `'${str}`;
    }

    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }
}
