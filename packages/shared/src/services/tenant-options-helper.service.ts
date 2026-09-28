import { inject, Injectable } from '@angular/core';
import { FetchClient } from '@c8y/client';
import { mapValues } from 'lodash';

@Injectable()
export class TenantOptionHelperService {
  private fetchClient = inject(FetchClient);

  /**
   * Fetches all tenant options for the given category and returns them as a
   * typed partial object. String values that are valid JSON are automatically
   * parsed; all others are kept as-is.
   *
   * @param category - The tenant option category to retrieve.
   * @returns A promise resolving to a partial object of type `T` whose keys
   *   correspond to the option keys returned by the platform.
   */
  async getOptionsByCategory<T extends object>(category: string): Promise<Partial<T>> {
    try {
      const response = (await (
        await this.fetchClient.fetch(`/tenant/options/${category}`)
      ).json()) as Record<string, string>;

      return this.parseTenantOptions<T>(response);
    } catch (error) {
      console.error(`Failed to fetch tenant options for category "${category}":`, error);

      return {};
    }
  }

  /**
   * Parses a flat map of tenant option key/value pairs, converting each string
   * value to its native JSON representation where possible.
   *
   * Values that cannot be parsed as JSON (e.g. plain strings) are kept
   * unchanged, and a warning is logged to the console for each such entry.
   *
   * @param options - Raw key/value map returned by the platform.
   * @returns A partial object of type `T` with parsed values.
   */
  private parseTenantOptions<T extends object>(options: Record<string, string>): Partial<T> {
    const parsed = mapValues(options, (value, key): unknown => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        console.warn(`Tenant option "${key}" is not valid JSON, kept as string`);

        return value;
      }
    });
    return parsed as Partial<T>;
  }
}
