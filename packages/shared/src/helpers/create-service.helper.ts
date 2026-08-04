import { Provider, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';

/**
 * Instantiates a service through `TestBed` with the given dependency overrides.
 *
 * Services use `inject()` for their dependencies, so they can no longer be built
 * with `new Service(dep)` — construction has to happen inside an injection
 * context. This keeps specs a one-liner instead of a `configureTestingModule`
 * block per test.
 *
 * Like `auto-mock.helper`, this is test-only and is deliberately **not** exported
 * from the package barrel.
 *
 * @param type the service class under test
 * @param providers dependency stubs, e.g. `[{ provide: InventoryService, useValue: stub }]`
 */
export function createService<T>(type: Type<T>, providers: Provider[] = []): T {
  TestBed.configureTestingModule({ providers: [type, ...providers] });

  return TestBed.inject(type);
}
