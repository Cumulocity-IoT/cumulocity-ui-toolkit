import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { LocalStorageService } from './local-storage.service';

export const ACTIVE_TAB_STORAGE_KEY = 'c8y_rpActiveTab';

/**
 * Service to track and manage the active browser tab state across multiple tabs.
 * Uses localStorage to synchronize active tab state and window focus/blur events.
 * Must call `init()` after instantiation to begin tracking.
 */
@Injectable()
export class ActiveTabService implements OnDestroy {
  active$?: BehaviorSubject<boolean>;
  lastActive$?: BehaviorSubject<boolean>;

  private tabId?: string;
  private subscriptions = new Subscription();
  private isInitialized = false;
  private focusHandler = this.onWindowFocus.bind(this);
  private blurHandler = this.onWindowBlur.bind(this);

  /**
   * Creates an instance of ActiveTabService.
   * @param localStorageService - Service for managing localStorage operations
   */
  constructor(private localStorageService: LocalStorageService) {
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
    this.active$?.complete();
    this.lastActive$?.complete();
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
    this.active$ = new BehaviorSubject(tabActive);
    this.lastActive$ = new BehaviorSubject(tabActive);
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
   * Updates the lastActive$ observable if the active tab state has changed.
   * @private
   */
  private handleStorageUpdate(): void {
    if (!this.tabId || !this.active$ || !this.lastActive$) return;

    const isActive = this.localStorageService.get(ACTIVE_TAB_STORAGE_KEY) === this.tabId;

    // update lastActive, if it has changed
    if (isActive !== this.lastActive$.getValue()) {
      this.lastActive$.next(isActive);
    }
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
   * Marks this tab as active and updates the active$ observable.
   * @private
   */
  private onWindowFocus(): void {
    this.setCurrentTabActive();

    if (this.active$ && !this.active$.getValue()) {
      this.active$.next(true);
    }
  }

  /**
   * Handles the window blur event.
   * Marks this tab as inactive and updates the active$ observable.
   * @private
   */
  private onWindowBlur(): void {
    if (this.active$) {
      this.active$.next(false);
    }
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
