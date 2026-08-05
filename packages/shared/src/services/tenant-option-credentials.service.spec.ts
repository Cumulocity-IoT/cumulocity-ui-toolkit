import { TenantOptionsService } from '@c8y/client';
import { TenantOptionCredentialsService } from './tenant-option-credentials.service';
import { createService } from '~helpers/create-service.helper';

describe('TenantOptionCredentialsService', () => {
  let tenantOptions: {
    create: jasmine.Spy;
    detail: jasmine.Spy;
    delete: jasmine.Spy;
    list: jasmine.Spy;
  };
  let service: TenantOptionCredentialsService;

  beforeEach(() => {
    tenantOptions = {
      create: jasmine.createSpy('create').and.returnValue(Promise.resolve({})),
      detail: jasmine.createSpy('detail'),
      delete: jasmine.createSpy('delete').and.returnValue(Promise.resolve({})),
      list: jasmine.createSpy('list'),
    };
    service = createService(TenantOptionCredentialsService, [
      { provide: TenantOptionsService, useValue: tenantOptions },
    ]);
  });

  it('saves credentials and returns generated token', async () => {
    spyOn(Math, 'random').and.returnValue(0.1234);

    const token = await service.saveCredentials({ username: 'u', password: 'p' });

    expect(token).toBe(String(Math.floor(0.1234 * 1e16)));
    expect(tenantOptions.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ key: `${token}.username`, value: 'u' })
    );
    expect(tenantOptions.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ key: `credentials.${token}.password`, value: 'p' })
    );
  });

  it('loads username and password by token', async () => {
    tenantOptions.detail.and.returnValues(
      Promise.resolve({ data: { value: 'u1' } }),
      Promise.resolve({ data: { value: 'p1' } })
    );

    expect(await service.getCredentials('t1')).toEqual({ username: 'u1', password: 'p1' });
  });

  it('clears all credentials in the category', async () => {
    tenantOptions.list.and.returnValue(
      Promise.resolve({
        data: [
          { category: 'my-custom.credentials', key: 'a' },
          { category: 'x', key: 'b' },
        ],
      })
    );

    const deletions = await service.clearAllCredentials();

    const result: any = deletions;

    expect(result).toEqual(jasmine.arrayContaining([jasmine.any(Object)]));
    expect(tenantOptions.delete).toHaveBeenCalledWith({
      category: 'my-custom.credentials',
      key: 'a',
    });
  });
});
