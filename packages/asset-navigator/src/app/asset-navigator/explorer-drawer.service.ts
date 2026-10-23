import { Injectable, computed, inject, signal } from '@angular/core';
import { UserPreferencesService } from '@c8y/ngx-components';
import { firstValueFrom } from 'rxjs';

export const DRAWER_MIN_WIDTH = 280;
export const DRAWER_MAX_WIDTH = 720;
export const DRAWER_DEFAULT_WIDTH = 400;

const PREF_WIDTH = 'ps.assetNav.drawerWidth';
const PREF_PINNED = 'ps.assetNav.drawerPinned';

/**
 * Smallest chrome the drawer can align to the navigator's header rule: its own header (46px)
 * plus the quick-access row (32px) plus the rule itself. Below this there is no room left for
 * the breadcrumb, so the measured alignment is abandoned rather than applied — keep in step
 * with `--ps-drawer-header-height` / `--ps-tree-quick-row-height` in the stylesheet.
 */
const MIN_CHROME_HEIGHT = 46 + 32 + 1;

/**
 * Open/pin/width state of the explorer drawer (§5.1), persisted per user.
 *
 * Width and pin state are per-user view preferences, so they live in
 * `UserPreferencesService` — on the user object where permissions allow, in local
 * storage otherwise (OQ-T4, resolved).
 */
@Injectable({ providedIn: 'root' })
export class ExplorerDrawerService {
  private readonly preferences = inject(UserPreferencesService);

  private readonly openState = signal(false);
  private readonly pinnedState = signal(false);
  private readonly widthState = signal(DRAWER_DEFAULT_WIDTH);
  private readonly resizingState = signal(false);
  /**
   * Viewport-relative point the drawer anchors to, measured from the shell's navigator on
   * open. `null` when it could not be measured — the drawer then keeps its CSS fallback
   * offsets rather than jumping to the top-left corner.
   */
  private readonly anchorState = signal<{ left: number; top: number } | null>(null);
  /**
   * Distance from the drawer's own top edge to the bottom of the navigator's header rule,
   * measured on open. The drawer sizes the chrome above the hierarchy to it, so the rule
   * under *Pinned & Recent* continues the navigator's separator instead of missing it by a
   * pixel or two — the platform's header is 108px plus a border, but that is branding-
   * configurable and differs between the expanded navigator and our 48px rail, so it is
   * measured rather than hardcoded. `null` when the header could not be found: the CSS
   * fallback (108px) then stands.
   */
  private readonly chromeState = signal<number | null>(null);
  readonly chromeHeight = this.chromeState.asReadonly();

  /** Teardown for the shell observers, or `null` while the drawer is closed. */
  private stopObservingFn: (() => void) | null = null;

  readonly open = this.openState.asReadonly();
  readonly pinned = this.pinnedState.asReadonly();
  readonly width = this.widthState.asReadonly();
  readonly resizing = this.resizingState.asReadonly();
  readonly anchor = this.anchorState.asReadonly();

  /** Unpinned, the drawer floats over page content and closes on outside click. */
  readonly overlaying = computed(() => this.open() && !this.pinned());

  constructor() {
    void this.load();
  }

  /**
   * Toggles the drawer, re-measuring where it should sit each time it opens — and then
   * keeping that measurement current for as long as it stays open (see {@link observeShell}).
   */
  toggle(): void {
    const opening = !this.openState();

    if (opening) {
      this.measure();
      this.observeShell();
    } else {
      this.stopObserving();
    }
    this.openState.set(opening);
  }

  /**
   * Measures where the drawer should sit, from the shell's own elements.
   *
   * Measured rather than derived from tokens because the shell exposes neither geometry as a
   * CSS custom property: the navigator's width is `--c8y-navigator-panel-width` (240px) but
   * collapses to our 48px rail, and the header's height exists only as the SCSS
   * `$header-bar-height` (64px), which a plugin cannot read at runtime. Branding can change
   * both. The selector lists are fallback chains, and a miss is not fatal — the CSS defaults
   * then stand.
   *
   * Two things this must get right, both of which it previously got wrong:
   *
   * - **`top` is the bottom of the header bar, not the navigator's top.** `.navigator` is
   *   `top: 0`, so anchoring to it put the drawer *under* `.app-main-header` — which is
   *   `position: fixed` at `z-index: $zindex-navbar-fixed + 1` (1031) against our 1030, so the
   *   header painted over the drawer's first ~64px and swallowed the breadcrumb. Starting
   *   below the header removes the overlap entirely, which is the right fix: raising our
   *   z-index instead would put a navigation drawer on top of the page title.
   * - **`left` is the navigator's right edge, re-read on every change.** See
   *   {@link observeShell}.
   */
  private measure(): void {
    const navigator = document.querySelector('.app-main-navigator, c8y-navigator, .navigator');

    if (!navigator) return;

    const box = navigator.getBoundingClientRect();
    // A comma selector-list resolves in DOCUMENT order, not list order — and the first match
    // here is the `<c8y-header-bar>` custom element itself, a zero-height wrapper whose child
    // `div.app-main-header` carries the actual 64px box. Measuring the wrapper put the drawer
    // at `top: 0`, under the fixed header (z 1031 vs our 1030), which swallowed the drawer's
    // own header and half the breadcrumb. So: take the first match that has a height.
    const header =
      Array.from(
        document.querySelectorAll<HTMLElement>('.app-main-header, c8y-header-bar, .header-bar')
      ).find((candidate) => candidate.getBoundingClientRect().height > 0) ?? null;
    // `Math.max(…, 0)` guards the small-viewport case, where the header is not fixed at the
    // top of the viewport and its bottom can land above it.
    const top = header ? Math.max(Math.round(header.getBoundingClientRect().bottom), 0) : box.top;

    this.anchorState.set({ left: Math.round(box.right), top });

    // The chrome above the hierarchy is sized so its last rule continues the rule under the
    // navigator's `.title` block to its left. That is only achievable while the drawer's own
    // header and quick-access row fit inside the remaining distance — which they no longer do
    // once the drawer starts below the header bar (the title's rule sits at y=108, the drawer
    // now starts at y=64, leaving 44px for 46+32+1). So it is applied when it fits and
    // otherwise left unset, and the stylesheet's own 108px stands rather than a negative
    // breadcrumb height.
    const title = navigator.querySelector('.title');
    const titleBottom = title?.getBoundingClientRect().bottom;
    const chrome = titleBottom === undefined ? null : Math.round(titleBottom - top);

    this.chromeState.set(chrome !== null && chrome >= MIN_CHROME_HEIGHT ? chrome : null);
  }

  /**
   * Keeps the anchor current while the drawer is open.
   *
   * The measurement used to happen once per open, so collapsing the navigator left the drawer
   * behind at the expanded width — a 192px gap between the 48px rail and the drawer's left
   * edge. A `ResizeObserver` on the navigator is what fixes it, and it is deliberately chosen
   * over watching `HeaderService.navigatorOpen$`: the rail collapse is a 0.4s CSS `width`
   * transition, so the observer fires *through* the animation and the drawer travels with it
   * rather than jumping when a boolean flips. It also covers what no state signal would:
   * branding that changes the navigator's width.
   *
   * `window.resize` is watched too, because the header's height and the navigator's width both
   * respond to breakpoints.
   *
   * Its blind spot is a move without a resize: below the platform's 1200px breakpoint the
   * navigator slides off-canvas by changing `left` at a constant width, which a
   * `ResizeObserver` does not see. That is deliberate rather than overlooked — the rail styles
   * are scoped to `min-width: 1200px` precisely because the off-canvas overlay is the correct
   * behaviour on a narrow viewport, and a drawer of this width has no business tracking it.
   */
  private observeShell(): void {
    this.stopObserving();
    if (typeof ResizeObserver === 'undefined') return;

    const navigator = document.querySelector('.app-main-navigator, c8y-navigator, .navigator');

    if (!navigator) return;

    const observer = new ResizeObserver(() => this.measure());

    observer.observe(navigator);
    const onResize = () => this.measure();

    window.addEventListener('resize', onResize);

    this.stopObservingFn = () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }

  private stopObserving(): void {
    this.stopObservingFn?.();
    this.stopObservingFn = null;
  }

  openDrawer(anchor?: { left: number; top: number }): void {
    // An explicit anchor wins, but the shell is still watched: the caller measured *once*, and
    // the navigator can collapse while the drawer is open either way.
    if (anchor) this.anchorState.set(anchor);
    else this.measure();
    this.observeShell();
    this.openState.set(true);
  }

  close(): void {
    this.stopObserving();
    this.openState.set(false);
  }

  setAnchor(anchor: { left: number; top: number }): void {
    this.anchorState.set(anchor);
  }

  async togglePinned(): Promise<void> {
    const pinned = !this.pinnedState();

    this.pinnedState.set(pinned);
    await this.persist(PREF_PINNED, pinned);
  }

  /** Live width while dragging. Clamped; persisted only when the drag ends. */
  setWidth(width: number): void {
    this.widthState.set(Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, Math.round(width))));
  }

  beginResize(): void {
    this.resizingState.set(true);
  }

  async endResize(): Promise<void> {
    this.resizingState.set(false);
    await this.persist(PREF_WIDTH, this.widthState());
  }

  private async load(): Promise<void> {
    try {
      const [width, pinned] = await Promise.all([
        firstValueFrom<unknown>(this.preferences.get(PREF_WIDTH)),
        firstValueFrom<unknown>(this.preferences.get(PREF_PINNED)),
      ]);

      if (typeof width === 'number') this.setWidth(width);
      if (typeof pinned === 'boolean') this.pinnedState.set(pinned);
    } catch {
      // Defaults stand — a preference is a convenience, not a precondition.
    }
  }

  private async persist(key: string, value: unknown): Promise<void> {
    try {
      await this.preferences.set(key, value);
    } catch {
      // Losing a width is not worth an alert.
    }
  }
}
