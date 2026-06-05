import { TenantOptionsService } from '@c8y/client';
import { TenantOptionCredentialsService } from './tenant-option-credentials.service';

describe('TenantOptionCredentialsService', () => {
  let tenantOptions: {
    create: jest.Mock;
    detail: jest.Mock;
    delete: jest.Mock;
    list: jest.Mock;
  };
  let service: TenantOptionCredentialsService;

  beforeEach(() => {
    tenantOptions = {
      create: jest.fn().mockResolvedValue({}),
      detail: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      list: jest.fn(),
    };
    service = new TenantOptionCredentialsService(tenantOptions as unknown as TenantOptionsService);
  });

  it('saves credentials and returns generated token', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.1234);

    const token = await service.saveCredentials({ username: 'u', password: 'p' });

    expect(token).toBe('1234000000000000');
    expect(tenantOptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ key: `${token}.username`, value: 'u' })
    );
    expect(tenantOptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ key: `credentials.${token}.password`, value: 'p' })
    );
  });

  it('loads username and password by token', async () => {
    tenantOptions.detail
      .mockResolvedValueOnce({ data: { value: 'u1' } })
      .mockResolvedValueOnce({ data: { value: 'p1' } });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await expect(service.getCredentials('t1')).resolves.toEqual({ username: 'u1', password: 'p1' });
  });

  it('clears all credentials in the category', async () => {
    tenantOptions.list.mockResolvedValue({
      data: [
        { category: 'my-custom.credentials', key: 'a' },
        { category: 'x', key: 'b' },
      ],
    });

    const deletions = await service.clearAllCredentials();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const result: any = deletions;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(result).toEqual(expect.arrayContaining([expect.any(Object)]));
    expect(tenantOptions.delete).toHaveBeenCalledWith({
      category: 'my-custom.credentials',
      key: 'a',
    });
  });
});
