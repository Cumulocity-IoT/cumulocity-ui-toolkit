import {
  DestroyRef,
  type EnvironmentProviders,
  Injectable,
  type Signal,
  type WritableSignal,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  signal,
} from '@angular/core';

/**
 * Payload shape for the reportable parts of an entry: a plain, JSON-serializable
 * object. Deliberately not `unknown` — every consumer would have to trust-cast —
 * and deliberately not a recursive `JsonValue`, which would force casts at the
 * call sites that project SDK models.
 */
export type AiContextData = Record<string, unknown>;

/** One reporting component's contribution to the shared AI context. */
export interface AiContextEntry {
  /**
   * Widget/view name, used as the chip label in the chat panel. User-visible, so
   * mark it with `gettext()` at the call site.
   */
  name: string;
  /** The reportable context — projected, plain, serializable data only. */
  contextData: AiContextData;
  /** What the component is about: widget type, dashboard id, route, geometry, … */
  metaData: AiContextData;
}

/** The whole store, keyed by a stable per-instance id (see the ui-to-ai spec). */
export type PsAiContextState = { [id: string]: AiContextEntry };

/**
 * Rendezvous keys for the cross-plugin state. `@c8y/devkit` shares every
 * dependency as a federation singleton, so all federated copies of this service
 * see one `@angular/core` runtime — a signal parked on `globalThis` under these
 * symbols is natively trackable from any plugin.
 *
 * The state has to live here rather than on the service instance: `shared` is not
 * a federated module, so every plugin bundle compiles its own copy of this class,
 * and each copy is a separate DI token with its own `'root'` instance. Those
 * copies are interchangeable façades over the state below — which is what makes a
 * lazily loaded plugin see what the others already reported.
 */
const STORE_SYMBOL = Symbol.for('c8y-ps.ai-context.v1');
const DEDUP_SYMBOL = Symbol.for('c8y-ps.ai-context.dedup.v1');
const CONSUMER_SYMBOL = Symbol.for('c8y-ps.ai-context.consumer.v1');
// v2: the slot holds a signal rather than a plain `Map` (see `observedAt`). The
// version is part of the key so a not-yet-rebuilt plugin bundle keeps its own v1
// map instead of handing one to code that calls it as a signal.
const OBSERVED_SYMBOL = Symbol.for('c8y-ps.ai-context.observed.v2');
const REFRESH_SYMBOL = Symbol.for('c8y-ps.ai-context.refresh.v1');

type GlobalWithStore = typeof globalThis & {
  [STORE_SYMBOL]?: WritableSignal<PsAiContextState>;
  [DEDUP_SYMBOL]?: Map<string, string>;
  [CONSUMER_SYMBOL]?: WritableSignal<boolean>;
  [OBSERVED_SYMBOL]?: WritableSignal<Record<string, string>>;
  [REFRESH_SYMBOL]?: Map<string, () => void>;
};

/**
 * The shared UI → AI context store: components on screen report what they show,
 * the assistant chat reads the whole store and injects it into the prompt.
 *
 * `providedIn: 'root'`, and reporting is unconditional — it is an in-memory signal
 * write of an already-capped projection, inert while nothing reads it. That is
 * deliberate, because plugins load **lazily and in any order**: a reporting view
 * may be on screen long before the assistant plugin is loaded (or in an
 * application that never loads it at all). Gating the write on the assistant's
 * presence would mean an entry only appears after the next projection change, so
 * the assistant would open blind to whatever is already on screen.
 *
 * Only genuinely invasive or costly work is gated, via {@link aiContextConsumed}
 * — see `AiActionTraceService`, which patches platform instrumentation.
 *
 * This is the only code that touches `globalThis`; everything else goes through
 * `report()` / `remove()` / `state`.
 */
@Injectable({ providedIn: 'root' })
export class AiContextService {
  private readonly store = resolveStore();

  /**
   * Last published payload per id. `report()` replaces the whole store object, so
   * every consumer `computed` recomputes on each write — including one that
   * re-serializes the entire store into the prompt block. Reporters driven by
   * realtime data call `report()` far more often than their projection actually
   * changes, so the diff is taken here rather than at each call site.
   *
   * Global for the same reason as the store: the diff has to be per id, not per
   * bundle-local service copy.
   */
  private readonly lastReported = resolveDedup();

  /**
   * When each id last *confirmed* its payload — updated even when the payload is
   * unchanged, so a consumer can tell "still true as of now" from "nobody looked
   * since". Global for the same reason as the store.
   *
   * A signal, not a plain map: it is read from `computed()`s (the prompt block, the
   * chip details), and those only recompute when something they track changes. A
   * re-report with an unchanged payload leaves `state()` alone by design, so a
   * non-reactive map would leave every reader pinned to the first timestamp — the
   * one case this field exists to distinguish. Recomputing on every confirmation
   * costs nothing downstream: the prompt block's dedupe key is computed over an
   * `observedAt`-stripped projection, so a fresher timestamp alone never resends.
   */
  private readonly observedAt = resolveObserved();

  /** Per-id pull callbacks, invoked by {@link requestRefresh}. */
  private readonly refreshHandlers = resolveRefreshHandlers();

  /** Readonly view of the whole store, for consumers. */
  readonly state: Signal<PsAiContextState> = this.store.asReadonly();

  /** Upserts one entry, unless it is identical to what this id last published. */
  report(id: string, entry: AiContextEntry): void {
    const serialized = serialize(entry);

    // Refuse it rather than poisoning the store: the prompt block serializes the
    // whole state at once, so one unserializable entry would take out everybody's.
    if (serialized === undefined) {
      if (isDevMode()) {
        console.warn(
          `[AiContextService] Entry "${id}" is not JSON-serializable — report projected plain data only.`
        );
      }

      return;
    }

    // Confirmed now, whether or not the payload moved — see `observedAt`.
    this.observedAt.update((observed) => ({ ...observed, [id]: new Date().toISOString() }));

    if (this.lastReported.get(id) === serialized) {
      return;
    }
    this.lastReported.set(id, serialized);

    if (isDevMode()) {
      warnIfNotPlainData(id, entry);
    }

    this.store.update((state) => ({ ...state, [id]: entry }));
  }

  /**
   * When `id` last confirmed its payload, as an ISO string, or `undefined` for an
   * id that never reported. Lets a consumer date each entry without the producers
   * having to timestamp their own projections.
   */
  observedAtOf(id: string): string | undefined {
    return this.observedAt()[id];
  }

  /**
   * Registers a pull callback for `id`: something that re-derives this entry and
   * `report()`s it. Invoked synchronously by {@link requestRefresh}, so the consumer
   * can guarantee the context it is about to read is current rather than whatever
   * the producer's last change-detection pass happened to leave behind.
   *
   * Opt-in and additive — a producer that never registers one behaves exactly as
   * before. Prefer {@link injectAiContextReporter}'s `onRefresh` option, which
   * unregisters on destroy.
   */
  onRefresh(id: string, refresh: () => void): void {
    this.refreshHandlers.set(id, refresh);
  }

  /** Drops `id`'s pull callback. */
  offRefresh(id: string): void {
    this.refreshHandlers.delete(id);
  }

  /**
   * Asks every registered producer to re-report *now*. Synchronous by design: the
   * caller (the chat, right before it assembles a prompt) must not have to guess how
   * many change-detection ticks a signal-based refresh would take. A throwing
   * handler is isolated so one broken producer cannot block a send.
   */
  requestRefresh(): void {
    for (const [id, refresh] of this.refreshHandlers) {
      try {
        refresh();
      } catch (error) {
        if (isDevMode()) {
          console.warn(`[AiContextService] Refresh handler for "${id}" threw.`, error);
        }
      }
    }
  }

  /** Removes one entry — call it when the reporting component is destroyed. */
  remove(id: string): void {
    this.lastReported.delete(id);
    this.refreshHandlers.delete(id);
    this.observedAt.update((observed) => {
      if (!(id in observed)) {
        return observed;
      }
      const { [id]: _removed, ...rest } = observed;
      return rest;
    });
    this.store.update((state) => {
      if (!(id in state)) {
        return state;
      }
      const { [id]: _removed, ...rest } = state;
      return rest;
    });
  }

  /** The whole store as it stands, for one-off console inspection. */
  dump(): PsAiContextState {
    return this.store();
  }
}

/**
 * Declares that this application *consumes* the UI → AI context — i.e. that the
 * Windy AI assistant is loaded. Called by the assistant plugin only.
 *
 * It does not provide the store (that is `providedIn: 'root'`, always available);
 * it flips the signal behind {@link aiContextConsumed}, so the invasive extras stay
 * off in applications that do not ship the assistant. Safe to call more than once —
 * federated plugin bundles each carry their own copy of this function.
 */
export function provideAiContext(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideEnvironmentInitializer(() => resolveConsumerFlag().set(true)),
  ]);
}

/**
 * Whether something in this application reads the context — i.e. whether
 * {@link provideAiContext} has run.
 *
 * A **signal**, not a boolean, on purpose: plugins load lazily and in any order,
 * so a value read once at construction time would be wrong for anything created
 * before the assistant plugin arrives. Gate on it reactively.
 */
export function aiContextConsumed(): Signal<boolean> {
  return resolveConsumerFlag().asReadonly();
}

/**
 * A component's handle on the store: reports under a fixed id and retracts the
 * entry when the injecting component/service is destroyed.
 */
export interface AiContextReporter {
  /** Publishes the current projection. Cheap to call: unchanged payloads are dropped. */
  report(entry: AiContextEntry): void;
  /** Retracts the entry ahead of destruction (rarely needed — destruction is handled). */
  remove(): void;
}

/**
 * Wires a component or view-scoped service into the store. Must be called from an
 * injection context (field initializer or constructor).
 *
 * ```ts
 * private readonly aiContext = injectAiContextReporter('ps.my-plugin.my-view');
 *
 * constructor() {
 *   effect(() => this.aiContext.report({ name: gettext('My view'), contextData: …, metaData: … }));
 * }
 * ```
 *
 * Reporting is not conditional on the assistant being loaded — see
 * {@link AiContextService} for why. The coupling stays loose all the same: this is
 * the whole contract a reporting package depends on, and it does nothing but write
 * to an in-memory signal that no one has to read.
 */
export function injectAiContextReporter(
  id: string,
  options?: {
    /**
     * Re-derives and re-`report()`s this entry on demand. Called synchronously when a
     * consumer asks for fresh context (`AiContextService.requestRefresh()`), i.e. right
     * before the assistant builds a prompt. Unchanged payloads are dropped, so this is
     * cheap to register.
     */
    onRefresh?: () => void;
  }
): AiContextReporter {
  const service = inject(AiContextService);

  if (options?.onRefresh) {
    service.onRefresh(id, options.onRefresh);
  }

  inject(DestroyRef).onDestroy(() => service.remove(id));

  return {
    report: (entry: AiContextEntry) => service.report(id, entry),
    remove: () => service.remove(id),
  };
}

function resolveStore(): WritableSignal<PsAiContextState> {
  const scope = globalThis as GlobalWithStore;
  return (scope[STORE_SYMBOL] ??= signal<PsAiContextState>({}));
}

function resolveDedup(): Map<string, string> {
  const scope = globalThis as GlobalWithStore;
  return (scope[DEDUP_SYMBOL] ??= new Map<string, string>());
}

function resolveObserved(): WritableSignal<Record<string, string>> {
  const scope = globalThis as GlobalWithStore;
  return (scope[OBSERVED_SYMBOL] ??= signal<Record<string, string>>({}));
}

function resolveRefreshHandlers(): Map<string, () => void> {
  const scope = globalThis as GlobalWithStore;
  return (scope[REFRESH_SYMBOL] ??= new Map<string, () => void>());
}

function resolveConsumerFlag(): WritableSignal<boolean> {
  const scope = globalThis as GlobalWithStore;
  return (scope[CONSUMER_SYMBOL] ??= signal(false));
}

/** The entry as it would go into the prompt, or `undefined` if it cannot. */
function serialize(entry: AiContextEntry): string | undefined {
  try {
    return JSON.stringify(entry);
  } catch {
    // Cyclic or BigInt — not reportable.
    return undefined;
  }
}

/**
 * Best-effort dev guard: values crossing the federation boundary must be plain
 * data. A class instance breaks `instanceof` in other bundles and, unlike a cycle,
 * survives `JSON.stringify` unnoticed — losing its methods and any accessor state
 * on the way into the prompt. Bounded in depth; this runs on every changed report.
 */
function warnIfNotPlainData(id: string, entry: AiContextEntry): void {
  const offender =
    findClassInstance(entry.contextData, 'contextData', 0) ??
    findClassInstance(entry.metaData, 'metaData', 0);

  if (offender) {
    console.warn(
      `[AiContextService] Entry "${id}" reports a class instance at "${offender}" — project to plain data first.`
    );
  }
}

const MAX_PLAIN_DATA_DEPTH = 4;

function findClassInstance(value: unknown, path: string, depth: number): string | null {
  if (depth > MAX_PLAIN_DATA_DEPTH || value === null || typeof value !== 'object') {
    return null;
  }

  // `Date` is a class instance, but a well-defined and lossless one across the
  // federation boundary — it serializes to its ISO string. Not worth warning about.
  if (value instanceof Date) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const offender = findClassInstance(item, `${path}[${index}]`, depth + 1);

      if (offender) {
        return offender;
      }
    }

    return null;
  }

  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype !== null && prototype !== Object.prototype) {
    return path;
  }

  for (const [key, item] of Object.entries(value)) {
    const offender = findClassInstance(item, `${path}.${key}`, depth + 1);

    if (offender) {
      return offender;
    }
  }

  return null;
}
