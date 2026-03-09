# Pipes

Shared Angular pipes provided by the `shared` package.

---

## `c8yMeasurement`

Formats an `IMeasurement` value for display. If the measurement contains exactly one fragment with one series, returns the numeric value (rounded, up to 2 decimal places) followed by its unit. Returns `'-'` for empty/multi-series measurements.

Optional parameters:
- `round` — `'ceil'` (default) or `'floor'`
- `digitsInfo` — Angular `DecimalPipe` digits-info string (default `'1.1-2'`)

```html
{{ measurement | c8yMeasurement }}
{{ measurement | c8yMeasurement: 'floor' }}
{{ measurement | c8yMeasurement: 'ceil' : '1.0-0' }}
```

---

## `fileNameToIcon`

Maps a file name to a Cumulocity icon name based on its extension. Falls back to `'file'` for unknown extensions.

```html
<i [c8yIcon]="fileName | fileNameToIcon"></i>
```

Supported extensions: archives (`zip`, `gz`, `tar`, …), images (`png`, `svg`, `jpg`, …), Office documents (`doc`, `xls`, `ppt`, …), `pdf`, `txt`, and common video formats.

---

## `filter`

Filters an array by one or more attribute/value conditions. All conditions must match (AND logic). String comparisons are case-insensitive.

```typescript
export interface FilterPipeValue {
  attr: string;
  value: string | number | boolean;
}
```

```html
{{ items | filter: [{ attr: 'status', value: 'active' }] }}
```

---

## `formatFileSize`

Formats a byte count into a human-readable size string. Pass `true` as the second argument for long-form unit names.

```html
{{ 1024 | formatFileSize }}        <!-- 1 KB -->
{{ 1048576 | formatFileSize }}     <!-- 1 MB -->
{{ 1024 | formatFileSize: true }}  <!-- 1 Kilobytes -->
```

---

## `nl2br`

Replaces newline characters (`n`) with `<br>` tags.

```html
<span [innerHTML]="text | nl2br"></span>
```

---

## `replace`

Replaces all occurrences of a substring. Omitting the third argument removes all matches.

```html
{{ 'foo-bar-baz' | replace: '-' : '_' }}  <!-- foo_bar_baz -->
{{ 'foo-bar-baz' | replace: '-' }}        <!-- foobarbaz -->
```

---

## `sort`

Sorts an array by a given attribute using lodash `sortBy`.

```html
{{ items | sort: 'name' }}
```

---

## `stringToBool`

Converts a string `'true'` (case-insensitive) to `true`, anything else to `false`.

```html
{{ 'true' | stringToBool }}   <!-- true -->
{{ 'False' | stringToBool }}  <!-- false -->
```