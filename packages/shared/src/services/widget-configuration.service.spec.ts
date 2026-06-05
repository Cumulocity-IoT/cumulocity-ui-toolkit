import { InventoryService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { WidgetConfigurationService } from './widget-configuration.service';

describe('WidgetConfigurationService', () => {
  it('returns widget configuration for existing widget', async () => {
    const inventoryService = {
      detail: jest.fn().mockResolvedValue({
        data: {
          c8y_Dashboard: {
            children: {
              w1: { config: { title: 'T' } },
            },
          },
        },
      }),
      update: jest.fn(),
    } as unknown as InventoryService;
    const alertService = { addServerFailure: jest.fn() } as unknown as AlertService;
    const service = new WidgetConfigurationService(inventoryService, alertService);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await expect(service.getWidgetConfiguration('d1', 'w1')).resolves.toEqual({ title: 'T' });
  });

  it('throws when widget does not exist in dashboard', async () => {
    const inventoryService = {
      detail: jest.fn().mockResolvedValue({ data: { c8y_Dashboard: { children: {} } } }),
      update: jest.fn(),
    } as unknown as InventoryService;
    const alertService = { addServerFailure: jest.fn() } as unknown as AlertService;
    const service = new WidgetConfigurationService(inventoryService, alertService);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await expect(service.getWidgetConfiguration('d1', 'w-missing')).rejects.toThrow(
      'w-missing doesn not exist in Dashboard d1'
    );
  });

  it('updates widget configuration and reports server failures', async () => {
    const update = jest.fn().mockRejectedValue(new Error('failed'));
    const inventoryService = {
      detail: jest.fn().mockResolvedValue({
        data: {
          c8y_Dashboard: {
            children: {
              w1: { config: { title: 'old' } },
            },
          },
        },
      }),
      update,
    } as unknown as InventoryService;
    const alertService = { addServerFailure: jest.fn() } as unknown as AlertService;
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
