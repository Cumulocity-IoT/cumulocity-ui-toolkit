import { Observable, Subscription, Subject } from 'rxjs';
import { IManagedObject, InventoryService } from '@c8y/client';
import { Injectable } from '@angular/core';
import { subMinutes } from 'date-fns';

const FETCH_INTERVAL = 5;
const FAILURE_LIMIT = 10;

@Injectable()
export class ManagedObjectUpdatePollingService {
  private subject = new Subject<IManagedObject[]>();
  readonly update$ = this.subject.asObservable();
  private loop: Subject<void>;
  private counter: Subscription;
  private running = false;
  private currentDate: string;
  private failureCount = 0;
  private interval = FETCH_INTERVAL;

  constructor(private inventory: InventoryService) {}

  /**
   * 
   * @param queryExtension for instructions how queries are built - check https://cumulocity.com/api/core/2024/#tag/Query-language
   * @param interval 
   * @returns 
   */
  startListening(queryExtension: string, interval = FETCH_INTERVAL): Observable<IManagedObject[]> {
    if (this.running) {
      return this.update$;
    }
    this.loop = new Subject();

    this.currentDate = subMinutes(new Date(), 5).toISOString();

    this.counter = this.loop.subscribe(() => this.checkForUpdates(queryExtension));
    this.running = true;
    this.interval = interval;
    this.iterateAfter();

    return this.update$;
  }

  private iterateAfter() {
    setTimeout(() => {
      this.loop.next();
    }, this.interval);
  }

  stopListening(): void {
    if (this.loop) {
      this.loop.complete();
      this.loop = null;
    }
    if (this.counter) {
      this.counter.unsubscribe();
      this.counter = null;
    }
    this.running = false;
  }

  private checkForUpdates(queryExtension: string) {
    const query = `$filter=(lastUpdated.date gt '${this.currentDate}' and ${queryExtension}')`;
    const filter = {
      pageSize: 200,
      withTotalPages: false,
      query,
    };

    this.inventory
      .list(filter)
      .then(
        (result) => {
          this.failureCount = 0;
          if (result.data.length) {
            this.subject.next(result.data);
            const moWithLatestDate = result.data.reduce((a, b) => (a.lastUpdated > b.lastUpdated ? a : b));
            this.currentDate = moWithLatestDate.lastUpdated;
          }
        },
        (error) => {
          this.failureCount++;
          if (this.failureCount >= FAILURE_LIMIT) {
            this.failureCount = 0;
            console.error(`Unable to detect updates for query ${query}`, error);
          }
        }
      )
      .finally(() => {
        this.iterateAfter();
      });
  }
}
