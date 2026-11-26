// The `?remotes=` value ({ contextPath: modules }) the shell loads a plugin with, from the plugin's
// cumulocity.config.ts. A plugin without an explicit `contextPath` is served by @c8y/devkit under the path
// derived from `runTime.name` (lower-cased, whitespace → '-'), while its `runTime.remotes` is keyed by the npm
// package name, which the shell cannot resolve: the modules come from `exports` then.
import { resolve } from 'node:path';

interface PluginConfig {
  default: {
    runTime: {
      name: string;
      contextPath?: string;
      remotes?: Record<string, string[]>;
      exports: Array<{ module: string }>;
    };
  };
}

export function pluginRemotes(plugin: string): Record<string, string[]> {
  // Playwright loads its config as CommonJS: `require` is what resolves the plugin's TypeScript config.
  const config = resolve(__dirname, `../../../packages/${plugin}/cumulocity.config`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runTime } = (require(config) as PluginConfig).default;

  if (runTime.contextPath && runTime.remotes) return runTime.remotes;
  const contextPath = runTime.name.toLowerCase().trim().replace(/\s+/g, '-');
  return { [contextPath]: [...new Set(runTime.exports.map((e) => e.module))] };
}
