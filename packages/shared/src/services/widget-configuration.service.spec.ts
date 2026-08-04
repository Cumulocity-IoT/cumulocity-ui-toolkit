import { InventoryService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { WidgetConfigurationService } from './widget-configuration.service';

describe('WidgetConfigurationService', () => {
  it('returns widget configuration for existing widget', async () => {
    const inventoryService = {
      detail: jasmine.createSpy('detail').and.returnValue(Promise.resolve({
        data: {
          c8y_Dashboard: {
            children: {
              w1: { config: { title: 'T' } },
            },
          },
        },
      })),
      update: jasmine.createSpy('update'),
    } as unknown as InventoryService;
    const alertService = { addServerFailure: jasmine.createSpy('addServerFailure') } as unknown as AlertService;
    const service = new WidgetConfigurationService(inventoryService, alertService);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(await service.getWidgetConfiguration('d1', 'w1')).toEqual({ title: 'T' });
  });

  it('throws when widget does not exist in dashboard', async () => {
    const inventoryService = {
      detail: jasmine.createSpy('detail').and.returnValue(Promise.resolve({ data: { c8y_Dashboard: { children: {} } } })),
      update: jasmine.createSpy('update'),
    } as unknown as InventoryService;
    const alertService = { addServerFailure: jasmine.createSpy('addServerFailure') } as unknown as AlertService;
    const service = new WidgetConfigurationService(inventoryService, alertService);

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      await service.getWidgetConfiguration('d1', 'w-missing');
      fail('Expected an error to be thrown');
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((error as any).message).toMatch(/w-missing.*Dashboard d1/);
    }
  });

  it('updates widget configuration and reports server failures', async () => {
    const update = jasmine.createSpy('update').and.returnValue(Promise.reject(new Error('failed')));
    const inventoryService = {
      detail: jasmine.createSpy('detail').and.returnValue(Promise.resolve({
        data: {
          c8y_Dashboard: {
            children: {
              w1: { config: { title: 'old' } },
            },
          },
        },
      })),
      update,
    } as unknown as InventoryService;
    const alertService = { addServerFailure: jasmine.createSpy('addServerFailure') } as unknown as AlertService;
    const service = new WidgetConfigurationService(inventoryService, alertService);

    await service.updateWidgetConfiguration('d1', 'w1', { title: 'new' });

    expect(update).toHaveBeenCalledWith({
      id: 'd1',
      c8y_Dashboard: {
        children: {
          w1: { config: { title: 'new' } },
        },
      },
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(alertService.addServerFailure).toHaveBeenCalled();
  });
});
