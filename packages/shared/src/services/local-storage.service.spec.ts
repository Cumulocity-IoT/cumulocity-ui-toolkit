import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sets and gets values and supports defaults', () => {
    const service = new LocalStorageService();

    service.set('k1', { a: 1 });

    expect(service.get<{ a: number }>('k1')).toEqual({ a: 1 });
    expect(service.getOrDefault('missing', 'fallback')).toBe('fallback');
  });

  it('deletes values from storage', () => {
    const service = new LocalStorageService();

    service.set('k2', 'v2');

    service.delete('k2');

    expect(service.get('k2')).toBeUndefined();
  });

  it('emits storage changes through a debounced stream', async () => {
    const service = new LocalStorageService();

    service.debounceTime = 20;
    service.init();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
    const emitted = firstValueFrom(service.storage$.pipe(take(1)));

    window.dispatchEvent(new StorageEvent('storage'));
    jest.advanceTimersByTime(20);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await expect(emitted).resolves.toBe(localStorage);
  });
});
