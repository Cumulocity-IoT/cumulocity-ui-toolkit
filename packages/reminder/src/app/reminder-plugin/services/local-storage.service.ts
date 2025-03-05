import { Injectable } from "@angular/core";
import { debounce, DebouncedFuncLeading } from "lodash";
import { Subject } from "rxjs";

@Injectable()
export class LocalStorageService {
  storage$: Subject<any> = new Subject();

  get debounceTime(): number {
    return this._debounceTime;
  }
  set debounceTime(delayInMS) {
    this._debounceTime = delayInMS;
    this.setStorageDebounce(delayInMS);
  }

  private _debounceTime = 100;
  private storageUpdateDebounce!: DebouncedFuncLeading<(value: any) => void>;

  constructor() {
    this.setStorageDebounce();
    this.listenToStorageChanges();
  }

  delete(key: string): void {
    localStorage.removeItem(key);
  }

  destroy(): void {
    this.storage$.complete();
  }

  get<T>(key: string): T | undefined {
    const storage = localStorage.getItem(key);

    return storage ? (JSON.parse(storage) as T) : undefined;
  }

  getOrDefault<T>(key: string, defaultValue: T): T {
    return this.get(key) || defaultValue;
  }

  // basically not needed but this way you can handle it all via the service
  set<T>(key: string, value: T): T {
    localStorage.setItem(key, JSON.stringify(value));

    return value;
  }

  private listenToStorageChanges(): void {
    window.addEventListener(
      'storage',
      () => this.storageUpdateDebounce(localStorage),
      false
    );
  }

  private setStorageDebounce(debounceTime = this.debounceTime): void {
    this.storageUpdateDebounce = debounce(
      (ls) => this.storage$.next(ls),
      debounceTime
    );
  }
}
