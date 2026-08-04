import { Injectable } from '@angular/core';
import { ApplicationService, IApplication } from '@c8y/client';

/**
 * Shared helper to check whether an application or microservice is installed
 * (subscribed / available) in the current tenant. Results are cached per name
 * for the lifetime of the service, as installation state does not change while
 * a dashboard is being configured.
 */
@Injectable({ providedIn: 'root' })
export class ApplicationAvailabilityService {
  private cache = new Map<string, Promise<boolean>>();

  constructor(private applicationService: ApplicationService) {}

  /**
   * Resolves to `true` if an application/microservice matching the given name or
   * context path is available to the current tenant.
   * @param nameOrContextPath Application name or context path (e.g. `'dtm'`).
   */
  isAvailable(nameOrContextPath: string): Promise<boolean> {
    if (!this.cache.has(nameOrContextPath)) {
      this.cache.set(nameOrContextPath, this.checkAvailability(nameOrContextPath));
    }

    return this.cache.get(nameOrContextPath);
  }

  private async checkAvailability(nameOrContextPath: string): Promise<boolean> {
    try {
      const { data } = await this.applicationService.listByName(nameOrContextPath);

      if (data?.some((app) => this.matches(app, nameOrContextPath))) {
        return true;
      }
    } catch {
      // ignore and fall back to a broader lookup below
    }

    try {
      const { data } = await this.applicationService.list({
        pageSize: 2000,
        withTotalPages: false,
      });

      return !!data?.some((app) => this.matches(app, nameOrContextPath));
    } catch {
      return false;
    }
  }

  private matches(app: IApplication, nameOrContextPath: string): boolean {
    return app?.name === nameOrContextPath || app?.contextPath === nameOrContextPath;
  }
}
