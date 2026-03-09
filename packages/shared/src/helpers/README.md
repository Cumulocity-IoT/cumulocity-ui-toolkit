# Helpers

Shared utility functions and classes provided by the `shared` package.

---

## `autoMock` / `provideMock`

**File:** `auto-mock.helper.ts`

Testing utilities for creating Jest-compatible mocks of Angular services and classes without requiring manual stub implementations.

### `autoMock<T>(cls)`

Reflects over a class prototype and returns a mock object where every method is replaced with `jest.fn()` and every property returns an empty string via a getter.

```typescript
import { autoMock } from 'shared';

const mockInventory = autoMock(InventoryService);
jest.spyOn(mockInventory, 'list').mockResolvedValue({ data: [] } as any);
```

### `provideMock<T>(cls)`

Wraps `autoMock` and returns an Angular `Provider` tuple suitable for use in `TestBed.configureTestingModule`.

```typescript
import { provideMock } from 'shared';

TestBed.configureTestingModule({
  providers: [provideMock(InventoryService)],
});
```

---

## `extractPlaceholdersFromObject` / `removePlaceholders`

**File:** `extract-placeholders.ts`

Utilities for working with `{{ placeholder }}` template strings embedded inside arbitrary object/array structures.

### `extractPlaceholdersFromObject(obj)`

Recursively walks an object or array and returns all unique `{{ ... }}` placeholder keys found in string values, along with the dot-notation path where each was found.

```typescript
import { extractPlaceholdersFromObject } from 'shared';

const result = extractPlaceholdersFromObject({
  title: 'Hello {{ name }}',
  meta: { description: 'By {{ author }}' },
});
// [{ key: 'name', path: 'title' }, { key: 'author', path: 'meta.description' }]
```

### `removePlaceholders(obj)`

Walks the object using `extractPlaceholdersFromObject` and sets every placeholder path to `undefined` in place.

```typescript
import { removePlaceholders } from 'shared';

const obj = { title: 'Hello {{ name }}' };
removePlaceholders(obj);
// obj.title === undefined
```

---

## Type guards — `domain-model-type.helper.ts`

**File:** `domain-model-type.helper.ts`

Runtime type guards for Cumulocity domain model objects.

### `isToCreateIOperation(obj)`

Returns `true` if `obj` looks like a new (not-yet-persisted) `IOperation` — i.e. it has a `deviceId` but no `id`.

```typescript
if (isToCreateIOperation(payload)) {
  await operationService.create(payload);
}
```

### `isMeasurement(value)`

Returns `true` if `value` conforms to the `IMeasurement` shape: has the required base fields (`id`, `type`, `time`, `self`, `source`) and contains at least one fragment with a series holding a numeric `value`.

```typescript
if (isMeasurement(incoming)) {
  // safely treat as IMeasurement
}
```

---

## `ReverseQueriesUtil`

**File:** `reverse-queries-util/`

Parses a Cumulocity inventory query string (the `$filter=` format used by `@c8y/client` `QueriesUtil`) back into a structured JSON object compatible with `QueriesUtil`.

### `buildQueryJSON(query?)`

Accepts a raw query string (with or without the `$filter=(...)` wrapper) and returns a `QueryJson` object, or `null` if the input is empty or unparseable.

```typescript
import { ReverseQueriesUtil } from 'shared';

const util = new ReverseQueriesUtil();

util.buildQueryJSON("$filter=(type eq 'c8y_Device' and has(c8y_IsDevice))");
// { __and: [{ type: 'c8y_Device' }, { __has: 'c8y_IsDevice' }] }

util.buildQueryJSON("name eq 'Sensor' or bygroupid(42)");
// { __or: [{ name: 'Sensor' }, { __bygroupid: 42 }] }
```

Supported query operators: `eq`, `lt`, `le`, `gt`, `ge`, `has(fragment)`, `bygroupid(id)`, `and`, `or`, `not`.
