import { IndexDbCachePluginProviders } from './index-db-cache.providers';

export { IndexDbCachePluginProviders };

/**
 * The name `cumulocity.config.ts` exposes. Kept: applications that installed the plugin
 * list it in their `remotes`, so renaming it would break them.
 */
export const indexDbCacheModule = IndexDbCachePluginProviders;
