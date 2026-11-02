import { isDevMode, signal, type WritableSignal } from '@angular/core';

/**
 * Opening the global search palette from another plugin's bundle.
 *
 * The palette's trigger lives in the `global-search` plugin; the asset tree lives in
 * `asset-navigator`. `shared` is not federated, so the two compile separate copies of every
 * service class and cannot inject each other — the rendezvous has to be shared *state* on
 * `globalThis`, exactly as `services/ai-chat.ts` does for the assistant. `@angular/core` **is** a
 * federation singleton, so a signal parked here is trackable from any bundle.
 *
 * Why it exists: in `high-volume` mode the drawer's filter can only match branches that are
 * loaded, so an unfound turbine needs a way out rather than a dead end. The palette answers over
 * the whole tenant (`passthrough` mode), which makes "search the whole tenant" a real handover and
 * not a consolation message.
 */
const SINK_SYMBOL = Symbol.for('c8y-ps.global-search.open.v1');

/** What a caller asks the palette to do. */
export interface GlobalSearchRequest {
  /** Prefill the input with this term, so the handover does not make the user retype it. */
  term?: string;
}

/** Handles a {@link GlobalSearchRequest}. Only the global-search plugin registers one. */
export type GlobalSearchSink = (request: GlobalSearchRequest) => void;

type GlobalWithSink = typeof globalThis & {
  [SINK_SYMBOL]?: { sink: WritableSignal<GlobalSearchSink | null> };
};

function resolveSlot(): { sink: WritableSignal<GlobalSearchSink | null> } {
  const scope = globalThis as GlobalWithSink;
  return (scope[SINK_SYMBOL] ??= { sink: signal<GlobalSearchSink | null>(null) });
}

/**
 * Whether anything is listening — a **signal**, because plugins load lazily and in any order.
 * Read as a plain boolean it would latch "absent" for whoever asked first, which is the bug
 * `AiContextService`'s `aiContextConsumed()` documents. Callers use it to hide an affordance that
 * cannot work on a tenant without the global-search plugin.
 */
export function globalSearchAvailable(): boolean {
  return resolveSlot().sink() !== null;
}

/** Opens the palette, if it is installed. A no-op with a dev-mode note when it is not. */
export function openGlobalSearch(request: GlobalSearchRequest = {}): void {
  const sink = resolveSlot().sink();

  if (!sink) {
    if (isDevMode()) {
      console.warn(
        '[global-search] Nothing is listening — the global search export of the navigation-and-search plugin is not installed.'
      );
    }

    return;
  }
  sink(request);
}

/**
 * Registers the palette as the listener. Called by `SearchTriggerComponent` while it is mounted.
 *
 * The trigger is hosted by the action bar, which destroys and recreates it on **every**
 * navigation (AGENTS.md → "A `hookAction` component is mounted on every route"), so this pairs
 * with {@link disconnectGlobalSearchSink} on destroy and re-registers on the next route. Only the
 * component's own sink is cleared, so a re-registration that happens before the old teardown
 * cannot leave the slot empty.
 */
export function connectGlobalSearchSink(sink: GlobalSearchSink): void {
  resolveSlot().sink.set(sink);
}

export function disconnectGlobalSearchSink(sink: GlobalSearchSink): void {
  const slot = resolveSlot();

  if (slot.sink() === sink) slot.sink.set(null);
}
