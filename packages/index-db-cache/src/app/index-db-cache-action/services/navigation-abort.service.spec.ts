import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { NEVER, Observable, Subject } from 'rxjs';
import { NavigationAbortInterceptorService } from './navigation-abort.service';
import { NavigationAbortStateService } from './navigation-abort-state.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/*
 * The shape `@c8y/client` actually produces: `Service.getUrl()` returns a
 * RELATIVE url with no leading slash. Testing with absolute urls hid a bug where
 * the allowlist matched nothing in the real app.
 */
const MEASUREMENTS = 'measurement/measurements';
const SERIES = 'measurement/measurements/series';
const ALARMS = 'alarm/alarms';
const EVENTS = 'event/events';
const CHILD_ASSETS = 'inventory/managedObjects/9790229/childAssets';

/** Some callers do go through FetchClient with an absolute url — cover both. */
const ABSOLUTE_SERIES = 'https://example.com/measurement/measurements/series';

function makeReq(url: string, options: Record<string, unknown> = {}) {
  return { url, method: 'GET', options: { method: 'GET', ...options } } as any;
}

/**
 * Captures the request the interceptor forwards, so a test can assert on the
 * options it produced rather than on the response.
 */
function makeHandler(response: Observable<any> = NEVER) {
  const seen: any[] = [];

  return {
    seen,
    handle(req: any) {
      seen.push(req);

      return response;
    },
  };
}

/** Lets queued microtasks run — the abort is deliberately deferred into one. */
function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('NavigationAbortInterceptorService', () => {
  let events: Subject<any>;
  let service: NavigationAbortInterceptorService;
  let state: NavigationAbortStateService;

  beforeEach(() => {
    events = new Subject<any>();

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { events } }],
    });

    state = TestBed.inject(NavigationAbortStateService);
    state.setActive(true);
    state.cancelledCount.set(0);

    service = TestBed.inject(NavigationAbortInterceptorService);
  });

  afterEach(() => {
    state.setActive(false);
  });

  // ─── Eligibility ───────────────────────────────────────────────────────────

  it('attaches a signal to measurement, series, alarm and event reads', () => {
    for (const url of [MEASUREMENTS, SERIES, ALARMS, EVENTS, ABSOLUTE_SERIES]) {
      const handler = makeHandler();

      service.intercept(makeReq(url), handler);

      expect(handler.seen[0].options.signal).withContext(url).toEqual(jasmine.any(AbortSignal));
    }
  });

  it('leaves inventory reads untouched — the asset navigator loads them on navigation', () => {
    const handler = makeHandler();

    service.intercept(makeReq(CHILD_ASSETS), handler);

    expect(handler.seen[0].options.signal).toBeUndefined();
  });

  it('leaves writes untouched even on an abortable endpoint', () => {
    const handler = makeHandler();

    service.intercept(makeReq(ALARMS, { method: 'PUT' }), handler);

    expect(handler.seen[0].options.signal).toBeUndefined();
  });

  it('leaves everything untouched while the switch is off', () => {
    state.setActive(false);
    const handler = makeHandler();

    service.intercept(makeReq(MEASUREMENTS), handler);

    expect(handler.seen[0].options.signal).toBeUndefined();
  });

  // ─── Cancellation ──────────────────────────────────────────────────────────

  it('aborts an in-flight read when a navigation starts', async () => {
    const handler = makeHandler();

    service.intercept(makeReq(MEASUREMENTS), handler).subscribe({ error: () => undefined });
    const { signal } = handler.seen[0].options;

    events.next(new NavigationStart(1, '/group/1'));
    await flushMicrotasks();

    expect(signal.aborted).toBeTrue();
  });

  it('defers the abort out of the router-event call stack', () => {
    const handler = makeHandler();

    service.intercept(makeReq(MEASUREMENTS), handler).subscribe({ error: () => undefined });
    const { signal } = handler.seen[0].options;

    events.next(new NavigationStart(1, '/group/1'));

    // Aborting synchronously here let an AbortError propagate back through the
    // router's event emission and tear down unrelated subscribers.
    expect(signal.aborted).toBeFalse();
  });

  it('does not let a failing request escape into the router event subscriber', () => {
    // A request whose observable errors the instant it is cancelled — the shape
    // that previously propagated an AbortError back out through the router's
    // event emission and tore down unrelated subscribers.
    const failing = new Subject<any>();
    const handler = makeHandler(failing);

    service.intercept(makeReq(MEASUREMENTS), handler).subscribe({ error: () => undefined });
    handler.seen[0].options.signal.addEventListener('abort', () =>
      failing.error(new DOMException('aborted', 'AbortError'))
    );

    expect(() => events.next(new NavigationStart(1, '/group/1'))).not.toThrow();
  });

  it('does not cancel reads the incoming route starts', async () => {
    events.next(new NavigationStart(1, '/group/1'));
    await flushMicrotasks();

    const handler = makeHandler();

    service.intercept(makeReq(MEASUREMENTS), handler).subscribe({ error: () => undefined });
    const { signal } = handler.seen[0].options;

    events.next(new NavigationEnd(1, '/group/1', '/group/1'));
    await flushMicrotasks();

    expect(signal.aborted).toBeFalse();
  });

  it('keeps a caller-supplied signal alive alongside the navigation one', () => {
    const caller = new AbortController();
    const handler = makeHandler();

    service
      .intercept(makeReq(MEASUREMENTS, { signal: caller.signal }), handler)
      .subscribe({ error: () => undefined });
    const { signal } = handler.seen[0].options;

    caller.abort();

    expect(signal.aborted).toBeTrue();
  });

  // ─── Reporting ─────────────────────────────────────────────────────────────

  it('counts what it cancelled', () => {
    const handler = makeHandler();

    service.intercept(makeReq(MEASUREMENTS), handler).subscribe({ error: () => undefined });
    service.intercept(makeReq(ALARMS), handler).subscribe({ error: () => undefined });
    service.intercept(makeReq(CHILD_ASSETS), handler).subscribe({ error: () => undefined });

    events.next(new NavigationStart(1, '/group/1'));

    // The inventory read was never eligible, so it is not counted as cancelled.
    expect(state.cancelledCount()).toBe(2);
  });
});
