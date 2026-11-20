// Writes mock/windy-dev.json — the world the e2e mock serves — from the windy-dev tenant.
// Not committed: CI pulls it at the start of each e2e job, e2e-mock.mts pulls it when missing.
// Uses go-c8y-cli: a session (C8Y_SESSION=~/.cumulocity/windy-dev…json) or, in CI,
// C8Y_HOST / C8Y_USER / C8Y_PASSWORD.
//   pnpm run e2e:world:pull
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pullWorld } from '@cumulocity-iot/ui-sdk';

const ROOT = process.env.WORLD_ROOT ?? '392045059'; // windy-dev: energy site "Cuxhaven"
const MAX_EVENTS_PER_SOURCE = 50;
const out = resolve(import.meta.dirname, '../mock/windy-dev.json');

const world = await pullWorld({ roots: [ROOT], days: 7, maxMeasurements: 200, log: (line) => console.log(line) });

// Events dominate the size (tens of thousands per week); keep the newest few per source.
const perSource = new Map<string, number>();
world.events = (world.events ?? [])
  .sort((a, b) => String(b.time).localeCompare(String(a.time)))
  .filter((event) => {
    const id = String((event.source as { id: string }).id);
    const count = (perSource.get(id) ?? 0) + 1;
    perSource.set(id, count);
    return count <= MAX_EVENTS_PER_SOURCE;
  });

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(world, null, 2)}\n`);
console.log(`wrote ${out}: ${world.managedObjects?.length} objects, ${world.events.length} events`);
