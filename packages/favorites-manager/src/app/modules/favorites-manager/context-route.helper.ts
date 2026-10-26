import { type ActivatedRouteSnapshot } from '@angular/router';
import { type IManagedObjectExtended } from './favorites-manager.model';

/**
 * Finds the `contextData` (device / group / asset) of the current route.
 *
 * The depth at which the shell attaches `contextData` differs between shell
 * versions (1024 nests the device tabs one level deeper than 1023), so walk up
 * from the deepest active route instead of assuming it is the direct parent.
 */
export function findContextData(
  snapshot: ActivatedRouteSnapshot | null | undefined
): IManagedObjectExtended | undefined {
  let route = snapshot;

  while (route?.firstChild) {
    route = route.firstChild;
  }

  for (let current = route; current; current = current.parent) {
    const contextData = current.data?.['contextData'] as IManagedObjectExtended | undefined;

    if (contextData) {
      return contextData;
    }
  }

  return undefined;
}
