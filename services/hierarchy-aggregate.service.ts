import { Injectable } from '@angular/core';
import { IManagedObject, InventoryService } from '@c8y/client';
import { Observable, combineLatest, from } from 'rxjs';
import { switchMap, map, startWith, shareReplay } from 'rxjs/operators';
import { uniq, uniqBy } from 'lodash';

@Injectable({ providedIn: 'root' })
export class HierarchyAggregationService {
  private cache = new Map<string, Observable<IManagedObject[]>>();
  constructor(private inventoryService: InventoryService) {}

  getAllChildrenOfManagedObject$(moId: string, cache = true): Observable<IManagedObject[]> {
    const directChildren$ = this.getDirectChildrenOfManagedObject$(moId, cache);
    const allChildren$ = directChildren$.pipe(
      switchMap((children) =>
        combineLatest(
          children
            .filter((child) => this.hasChildren(child))
            .map((child) => this.getAllChildrenOfManagedObject$(child.id, cache))
        )
      ),
      map((children) => {
        return children.flat();
      })
    );

    return combineLatest([directChildren$, allChildren$]).pipe(
      map(([directChildren, allChildren]) => {
        return uniqBy([...directChildren, ...allChildren], (item) => item.id);
      }),
      startWith([])
    );
  }

  getAttributeValueOfAllChildren$<T>(
    extractAttribute: (mo: IManagedObject) => T,
    moId: string
  ): Observable<Array<T>> {
    return this.getAllChildrenOfManagedObject$(moId).pipe(
      map((children) => children.map(extractAttribute))
    );
  }

  getUniqAttributeValueOfAllChildren$<T>(
    extractAttribute: (mo: IManagedObject) => T,
    moId: string
  ): Observable<Array<T>> {
    return this.getAttributeValueOfAllChildren$(extractAttribute, moId).pipe(
      map((children) => uniq(children))
    );
  }

  private getDirectChildrenOfManagedObject$(
    moId: string,
    cache = true
  ): Observable<IManagedObject[]> {
    if (cache && this.cache.has(moId)) {
      return this.cache.get(moId);
    }

    const observable = from(
      this.inventoryService.list({
        query: `$filter=(bygroupid(${moId}))`,
        withChildrenCount: true,
        pageSize: 2000,
      })
    ).pipe(
      map(({ data }) => data),
      startWith([]),
      shareReplay(1)
    );
    this.cache.set(moId, observable);
    return observable;
  }

  private hasChildren(mo: IManagedObject): boolean {
    const { childAdditions, childAssets, childDevices } = mo as any;
    return childAdditions.count > 0 || childAssets.count > 0 || childDevices.count > 0;
  }
}
