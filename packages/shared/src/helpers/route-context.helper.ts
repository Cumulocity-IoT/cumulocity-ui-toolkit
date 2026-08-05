import { ActivatedRouteSnapshot } from '@angular/router';
import { IManagedObject } from '@c8y/client';
import { cloneDeep } from 'lodash';

/** How far up the route tree to look before giving up. */
const DEFAULT_MAX_PARENTS = 3;

/**
 * Resolves the managed object of the current dashboard/route context.
 *
 * Cumulocity puts the context object on `route.data.contextData`, but the route
 * a widget or action is rendered from is often a child of the route that carries
 * it, so the tree is walked upwards a bounded number of levels.
 *
 * Returns a deep clone so callers cannot mutate the router's state.
 *
 * @param route the route snapshot to start from
 * @param maxParents how many parent levels to check (default 3)
 */
export function getContextManagedObject(
  route: ActivatedRouteSnapshot | null | undefined,
  maxParents = DEFAULT_MAX_PARENTS
): IManagedObject | undefined {
  if (!route) {
    return undefined;
  }

  const contextData =
    (route.data?.['contextData'] as IManagedObject | undefined) ??
    (route.firstChild?.data?.['contextData'] as IManagedObject | undefined);

  if (contextData) {
    return cloneDeep(contextData);
  }

  if (maxParents <= 0) {
    return undefined;
  }

  return getContextManagedObject(route.parent, maxParents - 1);
}

/**
 * Like {@link getContextManagedObject}, but only returns the object when it is a
 * device, an asset or a device group.
 */
export function getContextDeviceOrAsset(
  route: ActivatedRouteSnapshot | null | undefined,
  maxParents = DEFAULT_MAX_PARENTS
): IManagedObject | undefined {
  const mo = getContextManagedObject(route, maxParents);

  if (!mo) {
    return undefined;
  }

  const isDeviceOrAsset =
    Object.hasOwn(mo, 'c8y_IsDevice') ||
    Object.hasOwn(mo, 'c8y_IsAsset') ||
    Object.hasOwn(mo, 'c8y_IsDeviceGroup');

  return isDeviceOrAsset ? mo : undefined;
}
