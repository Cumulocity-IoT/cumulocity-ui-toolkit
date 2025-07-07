/**
 * Utility functions for creating and providing auto-mocked Angular services/classes for unit testing with Jasmine.
 *
 * @module auto-mock.helper
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Provider } from '@angular/core';

/**
 * Automatically creates a mock object for the given class type.
 *
 * All methods are replaced with Jasmine spies, and all properties are defined with a getter returning an empty string.
 *
 * @template T The type to mock.
 * @param obj The class constructor to mock.
 * @returns {T} The mocked instance of the class.
 */
export function autoMock<T>(obj: new (...args: any[]) => T): T {
  const res = {} as any;

  const keys = Object.getOwnPropertyNames(obj.prototype);

  const allMethods = keys.filter((key) => {
    try {
      return typeof obj.prototype[key] === 'function';
    } catch (error) {
      return false;
    }
  });

  const allProperties = keys.filter((x) => !allMethods.includes(x));

  allMethods.forEach((method) => (res[method] = jasmine.createSpy()));

  allProperties.forEach((property) => {
    Object.defineProperty(res, property, {
      get: function () {
        return '';
      },
      configurable: true,
    });
  });

  return res as T;
}

/**
 * Provides an Angular provider for a mocked class using autoMock.
 * Example to mock the `InventoryService`:
 *
 * TestBed.configureTestingModule({
 *   providers: [provideMock(InventoryService)],
 * });
 *
 * @template T The type to mock.
 * @param type The class constructor to mock.
 * @returns {Provider} An Angular provider with the mock as useValue.
 */
export function provideMock<T>(type: new (...args: any[]) => T): Provider {
  const mock = autoMock(type);

  return { provide: type, useValue: mock };
}
