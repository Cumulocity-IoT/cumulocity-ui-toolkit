import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { IFetchResponse } from '@c8y/client';
import { ApiCall, HttpHandler, HttpInterceptor } from '@c8y/ngx-components/api';
import { Observable, filter } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { NavigationAbortStateService } from './navigation-abort-state.service';

/**
 * The only endpoints this interceptor will cancel.
 *
 * An allowlist rather than a denylist, because the first version of this got it
 * backwards and cancelled the asset navigator's own reads. Clicking a group in
 * the cockpit navigator fires `childAssets`, `?withParents=true` and the
 * `onlyRoots=true` group list *in reaction to* the route change — so those
 * requests belong to the incoming route, not the outgoing one, and aborting them
 * left the clicked node an unlabelled husk with no retry path.
 *
 * These three families are the ones that actually block: they fan out per device
 * and per datapoint, they are slow, and their consumers are widgets that will be
 * re-rendered from scratch anyway. Everything else — inventory, identity, tenant,
 * user, application, realtime — runs to completion untouched. If a new family
 * ever needs cancelling, it gets added here deliberately.
 */
/*
 * Anchored to a path boundary rather than a leading slash: `@c8y/client`'s
 * `Service.getUrl()` builds *relative* urls — `alarm/alarms`,
 * `measurement/measurements/series` — so a pattern like `/\/alarm\//` matches
 * nothing at all. That is why the cache interceptors in this package test with
 * `endsWith('measurement/measurements')` and no leading slash either.
 */
const ABORTABLE = [/(^|\/)measurement\//, /(^|\/)alarm\//, /(^|\/)event\//];

/**
 * Cancels in-flight reads when the user navigates away.
 *
 * `@c8y/client`'s services build their own `IFetchOptions` and drop anything a
 * caller passes, so there is no way to hand `MeasurementService.list()` an
 * `AbortSignal` from the outside. The interceptor chain is the seam that works
 * anyway: `ApiService` replaces `FetchClient.fetch` with the chain, and the
 * terminal handler passes whatever options the chain produced straight to the
 * browser `fetch` — which honours `signal`. So a signal injected here reaches a
 * request whose own service had no parameter for one.
 *
 * What that buys: a dashboard that fans out dozens of measurement reads per
 * render stops holding browser connections the moment the viewer leaves, rather
 * than running every one to completion into a component that no longer exists.
 * The next dashboard gets the connection budget instead of queueing behind the
 * abandoned one.
 *
 * What it costs: an aborted request rejects. Call sites that report failures to
 * the user will report the cancellation too, unless they filter `AbortError`.
 * That is why the switch is opt-in and why {@link ABORTABLE} is an allowlist
 * rather than a denylist.
 *
 * Writes are never cancelled — only GETs. A half-sent PUT that the user assumes
 * was saved is a data-loss bug, not a performance win.
 */
@Injectable({ providedIn: 'root' })
export class NavigationAbortInterceptorService implements HttpInterceptor {
  private readonly state = inject(NavigationAbortStateService);
  private readonly router = inject(Router);

  /** The current navigation's generation. Replaced, not reused, on each roll. */
  private controller = new AbortController();

  /** Eligible requests currently open, so a roll can report what it cancelled. */
  private inFlight = 0;

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed()
      )
      .subscribe(() => this.rollGeneration());
  }

  intercept(req: ApiCall, next: HttpHandler): Observable<IFetchResponse> {
    if (!this.state.isActive || !this.isEligible(req)) {
      return next.handle(req);
    }

    const signal = combineSignals(req.options?.signal, this.controller.signal);

    this.inFlight++;

    return next
      .handle({ ...req, options: { ...req.options, signal } })
      .pipe(finalize(() => this.inFlight--));
  }

  /**
   * Aborts the outgoing navigation's requests and opens a fresh generation, so
   * requests the *new* route starts are not cancelled by the navigation that
   * brought it into being.
   *
   * The abort is deferred out of the current call stack on purpose. `abort()`
   * dispatches its listeners synchronously, so calling it directly from the
   * router-event subscriber let an `AbortError` propagate back out through that
   * subscriber and into the router's own event emission — taking unrelated
   * subscribers down with it. A cancellation must never be able to reach the
   * code that merely triggered it, hence the microtask and the guard.
   */
  private rollGeneration(): void {
    const outgoing = this.controller;
    const cancelled = this.inFlight;

    this.controller = new AbortController();

    queueMicrotask(() => {
      try {
        outgoing.abort();
      } catch {
        /* a listener threw; it is not this subscriber's failure to report */
      }
    });

    if (cancelled > 0) {
      this.state.recordCancelled(cancelled);
    }
  }

  private isEligible(req: ApiCall): boolean {
    const method = (req.options?.method ?? req.method ?? 'GET').toUpperCase();

    if (method !== 'GET') {
      return false;
    }

    return ABORTABLE.some((pattern) => pattern.test(req.url));
  }
}

/**
 * A signal that fires when either input does, so a caller that already passes
 * its own `AbortSignal` keeps it. Without this, spreading ours over `options`
 * would silently discard a component's own cancellation.
 */
function combineSignals(
  callerSignal: AbortSignal | undefined | null,
  navigationSignal: AbortSignal
): AbortSignal {
  if (!callerSignal) {
    return navigationSignal;
  }

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([callerSignal, navigationSignal]);
  }

  const controller = new AbortController();
  const forward = () => controller.abort();

  for (const source of [callerSignal, navigationSignal]) {
    if (source.aborted) {
      forward();
      break;
    }
    source.addEventListener('abort', forward, { once: true });
  }

  return controller.signal;
}
