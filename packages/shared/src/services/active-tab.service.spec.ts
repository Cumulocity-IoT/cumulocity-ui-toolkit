import { BehaviorSubject, Subject } from 'rxjs';
import { ACTIVE_TAB_STORAGE_KEY, ActiveTabService } from './active-tab.service';
import { LocalStorageService } from './local-storage.service';

describe('ActiveTabService', () => {
  let storage$: Subject<unknown>;
  let localStorageService: jest.Mocked<Pick<LocalStorageService, 'get' | 'set' | 'storage$'>>;

  beforeEach(() => {
    storage$ = new Subject();
    localStorageService = {
      get: jest.fn(),
      set: jest.fn(),
      storage$,
    };

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: jest.fn(() => 'tab-1') },
    });
  });

  it('initializes and marks the current tab as active', () => {
    const service = new ActiveTabService(localStorageService as unknown as LocalStorageService);

    service.init();

    expect(service.active$).toBeInstanceOf(BehaviorSubject);
    expect(service.lastActive$.getValue()).toBe(true);
    expect(localStorageService.set).toHaveBeenCalledWith(ACTIVE_TAB_STORAGE_KEY, 'tab-1');
  });

  it('updates active flag on window focus and blur', () => {
    const service = new ActiveTabService(localStorageService as unknown as LocalStorageService);

    service.init();

    window.onblur?.(new FocusEvent('blur'));
    expect(service.active$.getValue()).toBe(false);

    window.onfocus?.(new FocusEvent('focus'));
    expect(service.active$.getValue()).toBe(true);
    expect(localStorageService.set).toHaveBeenCalledWith(ACTIVE_TAB_STORAGE_KEY, 'tab-1');
  });

  it('reacts to storage changes and updates lastActive$', () => {
    const service = new ActiveTabService(localStorageService as unknown as LocalStorageService);

    service.init();

    localStorageService.get.mockReturnValue('different-tab');
    storage$.next({});

    expect(service.lastActive$.getValue()).toBe(false);
  });

  it('returns active status from local storage', () => {
    const service = new ActiveTabService(localStorageService as unknown as LocalStorageService);

    service.init();

    localStorageService.get.mockReturnValue('tab-1');
    expect(service.isActive()).toBe(true);

    localStorageService.get.mockReturnValue('tab-2');
    expect(service.isActive()).toBe(false);
  });

  it('unsubscribes on destroy', () => {
    const service = new ActiveTabService(localStorageService as unknown as LocalStorageService);

    service.init();

    service.ngOnDestroy();

    localStorageService.get.mockReturnValue('different-tab');
    storage$.next({});
    expect(service.lastActive$.getValue()).toBe(true);
  });
});
