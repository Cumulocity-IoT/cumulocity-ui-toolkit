import { inject, signal, Injectable, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { LocalStorageService } from './local-storage.service';

export const ACTIVE_TAB_STORAGE_KEY = 'c8y_rpActiveTab';

/**
 * Service to track and manage the active browser tab state across multiple tabs.
 * Uses localStorage to synchronize active tab state and window focus/blur events.
 * Must call `init()` after instantiation to begin tracking.
 */
@Injectable()
export class ActiveTabService implements OnDestroy {
  /**
   * Created eagerly: as optional `BehaviorSubject`s these were `undefined` until
   * `init()` ran, which forced a null guard at every read.
   */
  readonly active = signal(false);
  readonly lastActive = signal(false);

  private tabId?: string;
  private subscriptions = new Subscription();
  private isInitialized = false;
  private focusHandler = this.onWindowFocus.bind(this);
  private blurHandler = this.onWindowBlur.bind(this);

  /**
   * Creates an instance of ActiveTabService.
   * @param localStorageService - Service for managing localStorage operations
   */
  private localStorageService = inject(LocalStorageService);

  constructor() {
    this.subscriptions.add(
      this.localStorageService.storage$.subscribe(() => this.handleStorageUpdate())
    );
  }

  /**
   * Lifecycle hook called when the service is destroyed.
   * Cleans up event listeners and completes observable streams.
   */
  ngOnDestroy(): void {
    this.removeEventListeners();
    this.subscriptions.unsubscribe();
  }

  /**
   * Initializes the service by setting up the active tab state and event listeners.
   * Must be called before using the service. Safe to call multiple times; subsequent calls are ignored.
   */
  init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const tabActive = !document.hidden;

    this.tabId = crypto.randomUUID();
    this.active.set(tabActive);
    this.lastActive.set(tabActive);
    if (tabActive) this.setCurrentTabActive();
    this.addEventListeners();
  }

  /**
   * Checks if this tab is currently the active tab across all open tabs of this application.
   * @returns True if this tab is active, false otherwise
   */
  isActive(): boolean {
    if (!this.tabId) return false;

    return this.tabId === this.localStorageService.get(ACTIVE_TAB_STORAGE_KEY);
  }

  /**
   * Handles storage updates triggered by changes in localStorage.
   * Updates the `lastActive` signal if the active tab state has changed.
   * @private
   */
  private handleStorageUpdate(): void {
    if (!this.tabId) return;

    const isActive = this.localStorageService.get(ACTIVE_TAB_STORAGE_KEY) === this.tabId;

    // `set` on an unchanged value is a no-op for signals, so no guard is needed.
    this.lastActive.set(isActive);
  }

  /**
   * Attaches focus and blur event listeners to the window.
   * @private
   */
  private addEventListeners(): void {
    window.addEventListener('focus', this.focusHandler);
    window.addEventListener('blur', this.blurHandler);
  }

  /**
   * Removes focus and blur event listeners from the window.
   * @private
   */
  private removeEventListeners(): void {
    window.removeEventListener('focus', this.focusHandler);
    window.removeEventListener('blur', this.blurHandler);
  }

  /**
   * Handles the window focus event.
   * Marks this tab as active and updates the `active` signal.
   * @private
   */
  private onWindowFocus(): void {
    this.setCurrentTabActive();
    this.active.set(true);
  }

  /**
   * Handles the window blur event.
   * Marks this tab as inactive and updates the `active` signal.
   * @private
   */
  private onWindowBlur(): void {
    this.active.set(false);
  }

  /**
   * Writes the current tab's ID to localStorage to mark it as the active tab.
   * @private
   */
  private setCurrentTabActive(): void {
    if (!this.tabId) return;
    this.localStorageService.set(ACTIVE_TAB_STORAGE_KEY, this.tabId);
  }
}
