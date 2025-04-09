import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { LocalStorageService } from './local-storage.service';

export const ACTIVE_TAB_STORAGE_KEY = 'c8y_rpActiveTab';

@Injectable()
export class ActiveTabService implements OnDestroy {
  active$!: BehaviorSubject<boolean>;
  lastActive$!: BehaviorSubject<boolean>;

  private tabId!: string;
  private subscriptions = new Subscription();

  constructor(private localStorageService: LocalStorageService) {
    this.setActiveTabListener();
    this.subscriptions.add(
      this.localStorageService.storage$.subscribe(() => this.handleStorageUpdate())
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  init(): void {
    const tabActive = !document.hidden;

    this.tabId = crypto.randomUUID();
    this.active$ = new BehaviorSubject(tabActive);
    this.lastActive$ = new BehaviorSubject(tabActive);
    if (tabActive) this.setCurrentTabActive();
  }

  isActive(): boolean {
    return this.tabId === this.localStorageService.get(ACTIVE_TAB_STORAGE_KEY);
  }

  private handleStorageUpdate(): void {
    const isActive = this.localStorageService.get(ACTIVE_TAB_STORAGE_KEY) === this.tabId;

    // update lastActive, if it has changed
    if (isActive !== this.lastActive$.getValue()) this.lastActive$.next(isActive);
  }

  private setActiveTabListener(): void {
    // focus » active, lastActive via localStorage (via setCurrentTabActive)
    window.onfocus = () => {
      this.setCurrentTabActive();
      if (!this.active$.getValue()) this.active$.next(true);
    };

    // blur » inactive, no update to lastActive
    window.onblur = () => {
      this.active$.next(false);
    };
  }

  private setCurrentTabActive(): void {
    this.localStorageService.set(ACTIVE_TAB_STORAGE_KEY, this.tabId);
  }
}
