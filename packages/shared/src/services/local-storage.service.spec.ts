import { take } from 'rxjs/operators';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('emits storage changes through a debounced stream', (done) => {
    const service = new LocalStorageService();

    service.debounceTime = 100;
    service.init();

    const subscription = service.storage$.pipe(take(1)).subscribe(
      (result) => {
        expect(result).toBe(localStorage);
        subscription.unsubscribe();
        done();
      },
      (error) => {
        fail(`Unexpected error: ${error}`);
        done();
      }
    );

    window.dispatchEvent(new StorageEvent('storage'));
  });
});
