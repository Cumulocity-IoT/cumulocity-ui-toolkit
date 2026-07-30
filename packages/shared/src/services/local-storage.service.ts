import { Injectable } from '@angular/core';
import { debounce, DebouncedFuncLeading } from 'lodash';
import { Subject } from 'rxjs';

/**
 * Service for managing browser localStorage with debounced updates and reactive notifications.
 * Provides type-safe get/set operations with change observables.
 */
@Injectable()
export class LocalStorageService {
  /**
   * Observable that emits whenever localStorage is updated externally or via this service.
   * Debounced to prevent excessive emissions.
   */
  readonly storage$: Subject<Storage> = new Subject();

  /**
   * Gets the current debounce delay in milliseconds.
   * @returns The debounce delay value
   */
  get debounceTime(): number {
    return this._debounceTime;
  }

  /**
   * Sets the debounce delay and reconfigures the debounce function.
   * @param delayInMS - The new debounce delay in milliseconds
   */
  set debounceTime(delayInMS: number) {
    this._debounceTime = delayInMS;
    this.setStorageDebounce(delayInMS);
  }

  private _debounceTime = 100;
  private storageUpdateDebounce!: DebouncedFuncLeading<(value: Storage) => void>;

  /**
   * Initializes the service by setting up debounce and storage change listener.
   * Must be called before using the service.
   */
  init(): void {
    this.setStorageDebounce();
    this.listenToStorageChanges();
  }

  /**
   * Deletes a value from localStorage.
   * @param key - The storage key to delete
   */
  delete(key: string): void {
    localStorage.removeItem(key);
  }

  /**
   * Completes the storage observable and cleans up resources.
   */
  destroy(): void {
    this.storage$.complete();
  }

  /**
   * Retrieves a typed value from localStorage, parsing it from JSON.
   * Returns undefined if the key doesn't exist or parsing fails.
   * @template T - The type of the value to retrieve
   * @param key - The storage key
   * @returns The parsed value or undefined if not found or invalid JSON
   */
  get<T>(key: string): T | undefined {
    try {
      const storage = localStorage.getItem(key);
      return storage ? (JSON.parse(storage) as T) : undefined;
    } catch (error) {
      console.warn(`Failed to parse localStorage value for key "${key}":`, error);

      return undefined;
    }
  }

  /**
   * Retrieves a typed value from localStorage or returns a default value.
   * Properly handles falsy values (0, false, empty string, etc.) - only returns default if key doesn't exist.
   * @template T - The type of the value to retrieve
   * @param key - The storage key
   * @param defaultValue - The value to return if key doesn't exist
   * @returns The stored value or the default value
   */
  getOrDefault<T>(key: string, defaultValue: T): T {
    const value = this.get<T>(key);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Stores a typed value in localStorage as JSON.
   * @template T - The type of the value to store
   * @param key - The storage key
   * @param value - The value to store
   * @returns The stored value
   */
  set<T>(key: string, value: T): T {
    localStorage.setItem(key, JSON.stringify(value));

    return value;
  }

  /**
   * Sets up a listener for cross-tab/window storage changes.
   * Emits changes through the storage$ observable.
   * @private
   */
  private listenToStorageChanges(): void {
    window.addEventListener('storage', () => this.storageUpdateDebounce(localStorage), false);
  }

  /**
   * Configures the debounce function for storage change emissions.
   * @private
   * @param debounceTime - The debounce delay in milliseconds
   */
  private setStorageDebounce(debounceTime = this.debounceTime): void {
    this.storageUpdateDebounce = debounce(
      (ls) => this.storage$.next(ls as unknown as Storage),
      debounceTime
    );
  }
}
