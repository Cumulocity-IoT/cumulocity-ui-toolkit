import { inject, Injectable } from '@angular/core';
import { ITenantOption, InventoryService, TenantOptionsService, UserService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { TranslateService } from '@ngx-translate/core';
import {
  TenantOptionConfiguration,
  TenantOptionConfigurationItem,
  TenantOptionRow,
} from './tenant-option-management.model';

@Injectable()
export class TenantOptionManagementService {
  private readonly MAX_PAGE_SIZE = 2000;
  private currentUser: Promise<string> | null = null;

  private inventory = inject(InventoryService);
  private tenantOption = inject(TenantOptionsService);
  private alertService = inject(AlertService);
  private userService = inject(UserService);
  private translateService = inject(TranslateService);

  /**
   * Returns the single `tenant_option_plugin_config` managed object used to
   * track which tenant options are managed by this plugin.  Creates it lazily
   * on first use.
   */
  async getConfiguration(): Promise<TenantOptionConfiguration> {
    const { data } = await this.inventory.list({
      pageSize: 1,
      type: 'tenant_option_plugin_config',
      withTotalPages: false,
      withChildren: false,
    });

    if (data.length) {
      return data[0] as TenantOptionConfiguration;
    } else {
      return (
        await this.inventory.create({
          type: 'tenant_option_plugin_config',
          options: [],
        })
      ).data as TenantOptionConfiguration;
    }
  }

  async addOption(option: ITenantOption): Promise<TenantOptionRow> {
    await this.tenantOption.create(option);
    const item = await this.addOptionToConfiguration(option);
    return { id: `${option.category}-${option.key}`, value: option.value ?? '', ...item };
  }

  /**
   * Appends `to` to the plugin's configuration managed object.
   * Rejects with `'Tenant option already exists!'` if an entry with the same
   * category+key combination is already registered.
   */
  async addOptionToConfiguration(to: ITenantOption): Promise<TenantOptionConfigurationItem> {
    const config = await this.getConfiguration();

    if (config.options.find((o) => o.category === to.category && o.key === to.key)) {
      return Promise.reject(new Error('Tenant option already exists!'));
    }

    const item: TenantOptionConfigurationItem = {
      key: to.key,
      category: to.category,
      lastUpdated: new Date().toISOString(),
      user: await this.getUser(),
    };

    config.options.push(item);

    await this.inventory
      .update({ id: config.id, options: config.options })
      .then((res) => res.data as TenantOptionConfiguration);

    return item;
  }

  /**
   * Updates the `lastUpdated` timestamp and `user` of an existing configuration
   * entry.  Rejects with `'Tenant option configuration does not exist!'` when
   * the category+key pair cannot be found.
   */
  async updateOptionForConfiguration(to: ITenantOption): Promise<TenantOptionConfigurationItem> {
    const config = await this.getConfiguration();

    const item = config.options.find((o) => o.category === to.category && o.key === to.key);

    if (!item) {
      return Promise.reject(new Error('Tenant option configuration does not exist!'));
    }

    item.lastUpdated = new Date().toISOString();
    item.user = await this.getUser();

    await this.inventory
      .update({ id: config.id, options: config.options })
      .then((res) => res.data as TenantOptionConfiguration);

    return item;
  }

  async allowListOption(keyCategory: ITenantOption): Promise<TenantOptionRow> {
    const { data: option } = await this.tenantOption.detail(keyCategory);

    const item = await this.addOptionToConfiguration(option);
    return { id: `${option.category}-${option.key}`, value: option.value ?? '', ...item };
  }

  async updateOption(row: ITenantOption & { value: string }): Promise<TenantOptionRow> {
    const option: ITenantOption = {
      category: row.category,
      key: row.key,
      value: row.value,
    };

    await this.tenantOption.update(option).then((res) => res.data);
    const item = await this.updateOptionForConfiguration(option);
    return { id: `${option.category}-${option.key}`, value: option.value ?? '', ...item };
  }

  /**
   * Fetches **all** tenant options across all pages (up to {@link MAX_PAGE_SIZE}
   * per request) and maps them to `{ id: "category-key", value }` pairs.
   * Returns an empty array and shows a danger alert on API failure.
   */
  async getAllOptions(): Promise<{ id: string; value: string }[]> {
    try {
      const tenantOptions: ITenantOption[] = [];
      const response = await this.tenantOption.list({
        pageSize: this.MAX_PAGE_SIZE,
        withTotalPages: true,
      });

      tenantOptions.push(...response.data);

      for (
        let currentPage = (response.paging?.currentPage ?? 1) + 1;
        currentPage <= (response.paging?.totalPages ?? 0);
        currentPage++
      ) {
        const { data } = await this.tenantOption.list({
          pageSize: this.MAX_PAGE_SIZE,
          currentPage: currentPage,
        });

        tenantOptions.push(...data);
      }

      return tenantOptions.map((o) => ({
        id: `${o.category}-${o.key}`,
        value: o.value ?? '',
      }));
    } catch (error) {
      this.alertService.danger(
        this.translateService.instant(gettext('Failed to load tenant options')) as string,
        (error as Error).message
      );

      return [];
    }
  }

  async deleteOption(row: TenantOptionRow) {
    try {
      await this.tenantOption.delete({ category: row.category, key: row.key });
    } catch (e) {
      // If the option is already gone we still want to clean up the configuration.
      // Any other failure must abort, otherwise the configuration would claim the
      // option was removed while it still exists.
      const status = (e as { res?: { status?: number } } | null)?.res?.status;

      if (status !== 404) {
        throw e;
      }
    }

    const config = await this.getConfiguration();
    const delta = {
      id: config.id,
      options: config.options.filter((o) => o.category !== row.category || o.key !== row.key),
    };

    await this.inventory.update(delta);
  }

  /**
   * Lazily resolves and caches the current user's ID (falling back to email).
   * The promise is stored in `this.currentUser` so subsequent calls within the
   * same service lifetime skip the `/user/currentUser` request.
   */
  private getUser(): Promise<string> {
    // Assigned to a local first so the returned promise is never `null`.
    const cached =
      this.currentUser ??
      this.userService.current().then((data) => {
        const { id, email } = data.data;

        return id ?? email ?? '';
      });

    this.currentUser = cached;

    return cached;
  }
}
