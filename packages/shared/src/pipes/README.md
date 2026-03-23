# Pipes

## c8yMeasurement

Returns the value with max two digits of an IMeasurement, if this contains just one fragment with one series.
```typescript
{{ measurement | c8yMeasurement }}
```

## fileNameToIcon

Returns an [icon name to be used by c8yIcon](https://styleguide.cumulocity.com/apps/codex/#/icons/icons/overview#icon-directive), as such:
```typescript
<i [c8yIcon]="fileName | fileNameToIcon"></i>
```

## filter

## formatFileSize

Formats a number of bytes to a human readable form.
```typescript
{{ 1024 | formatFileSize }} // outputs 1 KB
{{ 1024 | formatFileSize: true }} // outputs 1 Kilobytes
```

## nl2br

## replace 

## sort