import { IEvent } from '@c8y/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Returns a minimal valid IEvent with all required fields populated.
 * Pass `parts` to override any field.
 */
export function createEvent(parts?: Partial<IEvent>): IEvent {
  const base: IEvent = {
    source: { id: uuidv4() as string },
    name: Date.now().toString(36),
    text: Date.now().toString(36),
    time: new Date().toISOString(),
    type: Date.now().toString(36),
    id: uuidv4() as string,
  };
  return parts ? { ...base, ...parts } : base;
}

/** Alias for {@link createEvent} — creates a mock event with optional field overrides. */
export function mockEvent(parts?: Partial<IEvent>): IEvent {
  return createEvent(parts);
}
