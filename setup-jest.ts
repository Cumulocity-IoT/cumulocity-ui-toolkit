import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

// @zip.js/zip.js (used transitively by @c8y/ngx-components) references
// TransformStream at module load time; jsdom does not expose Web Streams API,
// so copy from Node.js 18+ built-ins before any test module is loaded.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { TransformStream, ReadableStream, WritableStream } = require('node:stream/web');
Object.assign(globalThis, { TransformStream, ReadableStream, WritableStream });

setupZoneTestEnv();
