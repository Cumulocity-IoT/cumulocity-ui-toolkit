import { Subject } from 'rxjs';
import { ACTIVE_TAB_STORAGE_KEY, ActiveTabService } from './active-tab.service';
import { LocalStorageService } from './local-storage.service';
import { createService } from '~helpers/create-service.helper';

describe('ActiveTabService', () => {
  const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
  const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalOnFocus = window.onfocus;
  const originalOnBlur = window.onblur;
  let storage$: Subject<unknown>;
  let localStorageService: jasmine.SpyObj<Pick<LocalStorageService, 'get' | 'set' | 'storage$'>>;

  afterEach(() => {
    if (originalHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    }

    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
    }
    window.onfocus = originalOnFocus;
    window.onblur = originalOnBlur;
  });

  beforeEach(() => {
    storage$ = new Subject();
    localStorageService = jasmine.createSpyObj<
      Pick<LocalStorageService, 'get' | 'set' | 'storage$'>
    >('LocalStorageService', ['get', 'set'], {
      storage$: storage$ as LocalStorageService['storage$'],
    });

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: jasmine.createSpy('randomUUID').and.returnValue('tab-1') },
    });
  });

  it('initializes and marks the current tab as active', () => {
    const service = createService(ActiveTabService, [
      {
        provide: LocalStorageService,
        useValue: localStorageService,
      },
    ]);

    service.init();

    expect(service.active()).toBe(true);
    expect(service.lastActive()).toBe(true);
    expect(localStorageService.set).toHaveBeenCalledWith(ACTIVE_TAB_STORAGE_KEY, 'tab-1');
  });

  it('updates active flag on window focus and blur', () => {
    const service = createService(ActiveTabService, [
      {
        provide: LocalStorageService,
        useValue: localStorageService,
      },
    ]);

    service.init();

    window.dispatchEvent(new FocusEvent('blur'));
    expect(service.active()).toBe(false);

    window.dispatchEvent(new FocusEvent('focus'));
    expect(service.active()).toBe(true);
    expect(localStorageService.set).toHaveBeenCalledWith(ACTIVE_TAB_STORAGE_KEY, 'tab-1');
  });

  it('reacts to storage changes and updates lastActive', () => {
    const service = createService(ActiveTabService, [
      {
        provide: LocalStorageService,
        useValue: localStorageService,
      },
    ]);

    service.init();

    localStorageService.get.and.returnValue('different-tab');
    storage$.next({});

    expect(service.lastActive()).toBe(false);
  });

  it('returns active status from local storage', () => {
    const service = createService(ActiveTabService, [
      {
        provide: LocalStorageService,
        useValue: localStorageService,
      },
    ]);

    service.init();

    localStorageService.get.and.returnValue('tab-1');
    expect(service.isActive()).toBe(true);

    localStorageService.get.and.returnValue('tab-2');
    expect(service.isActive()).toBe(false);
  });

  it('unsubscribes on destroy', () => {
    const service = createService(ActiveTabService, [
      {
        provide: LocalStorageService,
        useValue: localStorageService,
      },
    ]);

    service.init();

    service.ngOnDestroy();

    localStorageService.get.and.returnValue('different-tab');
    storage$.next({});
    expect(service.lastActive()).toBe(true);
  });
});
