import { TestBed } from '@angular/core/testing';
import { ApplicationService, IApplication } from '@c8y/client';
import { ApplicationAvailabilityService } from './application-availability.service';

function makeApp(overrides: Partial<IApplication> = {}): IApplication {
  return { id: '1', name: 'app', contextPath: 'app', ...overrides } as IApplication;
}

describe('ApplicationAvailabilityService', () => {
  let service: ApplicationAvailabilityService;
  let appServiceSpy: jasmine.SpyObj<ApplicationService>;

  beforeEach(() => {
    appServiceSpy = jasmine.createSpyObj<ApplicationService>('ApplicationService', [
      'listByName',
      'list',
    ]);

    TestBed.configureTestingModule({
      providers: [
        ApplicationAvailabilityService,
        { provide: ApplicationService, useValue: appServiceSpy },
      ],
    });

    service = TestBed.inject(ApplicationAvailabilityService);
  });

  describe('isAvailable()', () => {
    it('returns true when listByName finds a name match', async () => {
      appServiceSpy.listByName.and.returnValue(
        Promise.resolve({ data: [makeApp({ name: 'dtm', contextPath: 'dtm-svc' })] } as never)
      );
      expect(await service.isAvailable('dtm')).toBeTrue();
    });

    it('returns true when listByName finds a contextPath match', async () => {
      appServiceSpy.listByName.and.returnValue(
        Promise.resolve({
          data: [makeApp({ name: 'Digital Twin Manager', contextPath: 'dtm' })],
        } as never)
      );
      expect(await service.isAvailable('dtm')).toBeTrue();
    });

    it('returns false when listByName returns no match', async () => {
      appServiceSpy.listByName.and.returnValue(
        Promise.resolve({ data: [makeApp({ name: 'other', contextPath: 'other' })] } as never)
      );
      appServiceSpy.list.and.returnValue(
        Promise.resolve({ data: [makeApp({ name: 'other', contextPath: 'other' })] } as never)
      );
      expect(await service.isAvailable('dtm')).toBeFalse();
    });

    it('falls back to list() when listByName rejects', async () => {
      appServiceSpy.listByName.and.returnValue(Promise.reject(new Error('network')) as never);
      appServiceSpy.list.and.returnValue(
        Promise.resolve({ data: [makeApp({ name: 'dtm', contextPath: 'dtm' })] } as never)
      );
      expect(await service.isAvailable('dtm')).toBeTrue();
      expect(appServiceSpy.list).toHaveBeenCalled();
    });

    it('returns false when both lookups throw', async () => {
      appServiceSpy.listByName.and.returnValue(Promise.reject(new Error('err')) as never);
      appServiceSpy.list.and.returnValue(Promise.reject(new Error('err')) as never);
      expect(await service.isAvailable('dtm')).toBeFalse();
    });

    it('caches the result — listByName called only once for the same key', async () => {
      appServiceSpy.listByName.and.returnValue(
        Promise.resolve({ data: [makeApp({ name: 'dtm', contextPath: 'dtm' })] } as never)
      );
      await service.isAvailable('dtm');
      await service.isAvailable('dtm');
      await service.isAvailable('dtm');
      expect(appServiceSpy.listByName).toHaveBeenCalledTimes(1);
    });

    it('uses separate cache entries for different keys', async () => {
      appServiceSpy.listByName.and.returnValue(
        Promise.resolve({ data: [] } as never)
      );
      appServiceSpy.list.and.returnValue(
        Promise.resolve({ data: [] } as never)
      );
      await service.isAvailable('dtm');
      await service.isAvailable('other-app');
      expect(appServiceSpy.listByName).toHaveBeenCalledTimes(2);
    });
  });
});
