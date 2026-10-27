import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  DestroyRef,
  type ElementRef,
  ViewContainerRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type * as Leaflet from 'leaflet';
// Order matters: the canonical-instance pin must evaluate before markercluster
// (which augments the global L) — see geo-map-leaflet.ts.
import { L } from './geo-map-leaflet';
import 'leaflet.markercluster';
import { resolveBinding } from './geo-map-binding';
import {
  CLUSTER_SIZE,
  PIN_HEIGHT,
  PIN_WIDTH,
  buildClusterHtml,
  buildPinHtml,
} from './geo-map-icons';
import { GeoMapPopupComponent } from './geo-map-popup.component';
import type { GeoMapCategory, GeoMapConfig, GeoMapItem } from './geo-map.types';

/** A marker carrying the item it renders, so cluster aggregation can read it back. */
type ItemMarker = Leaflet.Marker & { __item?: GeoMapItem };

/** Andrew's monotone chain — hull of the child positions for the reveal area. */
function convexHull(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (input: [number, number][]) => {
    const out: [number, number][] = [];

    for (const p of input) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();

    return out;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

/**
 * Popup placement relative to the marker, whose anchor is the pin's TIP.
 *
 * y — the pin's height, less what the popup's own tail already covers, so the
 * point ends up just above the pin's head. That allowance is 15: leaflet's
 * `.leaflet-popup { margin-bottom: 20px }`, less 2px measured (at 20 the point
 * sat inside the head rather than on its top edge), less a 3px gap so it clears
 * the head instead of touching it. The original `PIN_HEIGHT - 4` double-counted
 * leaflet's margin and left a ~14px gap between tail and marker.
 *
 * x — the tail measured 1px right of the pin's anchor at two different map
 * positions, hence -1. Some drift is inherent and no constant removes it:
 * `Marker._setPos` rounds the marker to whole pixels
 * (`latLngToLayerPoint(...).round()`) while `Popup._updatePosition` does not, so
 * the two can disagree by up to a pixel depending on pan and zoom. Don't chase
 * it past this.
 */
const POPUP_OFFSET: [number, number] = [-1, -(PIN_HEIGHT - 15)];

const DEFAULT_TILES = {
  layerUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  label: 'OpenStreetMap',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

/**
 * Generic, hierarchy-unaware Leaflet map with clustered markers, category
 * donut rings on clusters, and a JSON-configured popup.
 * Contract & fixed UX rules: docs/FastNavigation/map-component-design.md
 */
@Component({
  selector: 'ps-geo-map',
  standalone: true,
  template: `
    <div class="ps-geo-map__container" #container></div>
    <ng-container #popupHost />
  `,
  styleUrls: ['./geo-map.component.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeoMapComponent implements AfterViewInit {
  // ── Inputs (reactive — change anytime, the map re-applies) ────────────────
  readonly items = input.required<GeoMapItem[]>();
  readonly config = input<GeoMapConfig>({ categories: [] });

  // ── Two-way state (shared with tree/table via the host's store) ───────────
  readonly selectedIds = model<string[]>([]);

  // ── Outputs (the map narrates, the host decides) ──────────────────────────
  readonly itemAction = output<{ itemId: string; actionId: string }>();
  readonly itemNavigate = output<{ itemId: string }>();
  readonly popupOpened = output<string | null>();
  readonly visibleIds = output<string[]>();
  readonly mapReady = output<void>();

  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container');
  private readonly popupHost = viewChild.required('popupHost', { read: ViewContainerRef });
  private readonly destroyRef = inject(DestroyRef);

  private readonly ready = signal(false);
  private readonly categoriesById = computed(
    () => new Map((this.config().categories ?? []).map((c) => [c.id, c]))
  );

  private map: Leaflet.Map;
  private clusterGroup: Leaflet.MarkerClusterGroup | null = null;
  private plainGroup: Leaflet.LayerGroup | null = null;
  private revealGroup: Leaflet.LayerGroup | null = null;
  private readonly markersById = new Map<string, Leaflet.Marker>();
  private readonly itemsById = new Map<string, GeoMapItem>();
  private selectedSet = new Set<string>();
  private lastConfig: GeoMapConfig | null = null;
  /**
   * The item set the view was last fitted to (sorted ids), or null. Not a
   * boolean: the map must re-fit when the population changes — switching layer
   * or filtering leaves the old bounds otherwise — while a value tick on the
   * same assets must not yank the view around.
   */
  private fittedTo: string | null = null;
  /** An explicit `initialView` means the caller owns the view; never auto-fit. */
  private autoFitDisabled = false;

  private popup: Leaflet.Popup;
  private popupRef: ComponentRef<GeoMapPopupComponent> | null = null;
  private popupItemId: string | null = null;
  private pinned = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private visibleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const items = this.items();
      const config = this.config();

      if (!this.ready()) return;
      untracked(() => this.sync(items, config));
    });
    effect(() => {
      const selected = new Set(this.selectedIds());

      if (!this.ready()) return;
      untracked(() => this.applySelection(selected));
    });
  }

  ngAfterViewInit(): void {
    const el = this.container().nativeElement;

    this.map = L.map(el, { zoomControl: true });

    const config = this.config();
    const tiles = config.tiles?.length ? config.tiles : [DEFAULT_TILES];
    const layers = tiles.map((t) =>
      L.tileLayer(t.layerUrl, {
        attribution: t.attribution ?? DEFAULT_TILES.attribution,
        // The shell is served with `Referrer-Policy: same-origin`, so tile requests would carry no
        // Referer and OSM auto-blocks unidentifiable traffic (403 "Access blocked", #380). Same
        // override the platform's own map module ships.
        referrerPolicy: 'strict-origin-when-cross-origin',
      })
    );

    layers[0].addTo(this.map);

    if (layers.length > 1) {
      L.control
        .layers(Object.fromEntries(tiles.map((t, i) => [t.label, layers[i]])))
        .addTo(this.map);
    }
    const view = config.initialView;

    this.map.setView(view ? [view.center.lat, view.center.lng] : [30, 0], view?.zoom ?? 2);
    if (view) this.autoFitDisabled = true;

    this.popup = L.popup({
      className: 'ps-gm-popup',
      closeButton: true,
      autoClose: false,
      closeOnClick: false,
      maxWidth: 480,
      // Rich popups can outgrow small maps — scroll inside instead of
      // overflowing past the map edge.
      maxHeight: 380,
      offset: POPUP_OFFSET,
    });
    this.map.on('popupclose', (e) => {
      if (e.popup !== this.popup) return;
      const wasPinned = this.pinned;

      this.popupItemId = null;
      this.pinned = false;
      if ((this.config().reveal ?? 'off') === 'popup') this.hideReveal();
      if (wasPinned) this.popupOpened.emit(null);
    });
    this.map.on('click', () => this.closePopup());
    this.map.on('moveend zoomend', () => this.scheduleVisibleIds());

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.closePopup();
    };

    window.addEventListener('keydown', onKeydown);

    const resizeObserver = new ResizeObserver(() => {
      if (!this.map) return;
      this.map.invalidateSize({ pan: false });
      // The first real size is also the first chance to fit — see `autoFit`.
      this.autoFit();
    });

    resizeObserver.observe(el);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', onKeydown);
      resizeObserver.disconnect();
      if (this.closeTimer) clearTimeout(this.closeTimer);
      if (this.visibleTimer) clearTimeout(this.visibleTimer);
      this.popupRef?.destroy();
      this.map.remove();
    });

    this.ready.set(true);
    this.mapReady.emit();
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  flyTo(itemId: string, opts?: { zoom?: number; openPopup?: boolean }): void {
    const marker = this.markersById.get(itemId);
    const item = this.itemsById.get(itemId);

    if (!marker || !item?.position) return;

    const open = () => {
      if (opts?.openPopup) this.openPopup(itemId);
    };

    if (opts?.zoom != null) {
      this.map.once('moveend', open);
      this.map.flyTo([item.position.lat, item.position.lng], opts.zoom);
    } else if (this.clusterGroup) {
      this.clusterGroup.zoomToShowLayer(marker, open);
    } else {
      this.map.once('moveend', open);
      this.map.flyTo([item.position.lat, item.position.lng], Math.max(this.map.getZoom(), 14));
    }
  }

  fitToItems(itemIds?: string[]): void {
    const items = itemIds
      ? itemIds.map((id) => this.itemsById.get(id)).filter((i) => i?.position)
      : [...this.itemsById.values()].filter((i) => i.position);

    if (!items.length) return;
    const bounds = L.latLngBounds(
      items.map((i) => [i.position.lat, i.position.lng] as [number, number])
    );

    this.map.fitBounds(bounds.pad(0.15), { maxZoom: 15 });
  }

  openPopup(itemId: string): void {
    this.showPopup(itemId, true);
  }

  closePopup(): void {
    if (this.popupItemId !== null) this.map.closePopup(this.popup);
  }

  getView(): { center: { lat: number; lng: number }; zoom: number } {
    const center = this.map.getCenter();
    return { center: { lat: center.lat, lng: center.lng }, zoom: this.map.getZoom() };
  }

  /** Escape hatch only — container resizes are handled automatically. */
  invalidateSize(): void {
    this.map?.invalidateSize({ pan: false });
  }

  /**
   * Fit the view to the current items when they are a different set than the
   * one already fitted.
   *
   * **Guarded on a laid-out container**: markers routinely arrive while the map
   * still measures 0×0 (a dashboard card initialising, a pane that is still
   * collapsed). `fitBounds` on a zero-size map computes a nonsense zoom — that
   * is how a park of turbines ended up rendered as the whole world several
   * times over. Skipping leaves `fittedTo` unset, and the ResizeObserver runs
   * this again the moment the container has a size.
   */
  private autoFit(): void {
    if (this.autoFitDisabled) return;
    const positioned = [...this.itemsById.values()].filter((i) => i.position);

    if (!positioned.length) return;
    const signature = positioned
      .map((i) => i.id)
      .sort()
      .join(',');

    if (signature === this.fittedTo) return;
    const size = this.map.getSize();

    if (size.x < 2 || size.y < 2) return;
    this.fittedTo = signature;
    this.fitToItems();
  }

  // ── Sync (diff by id — never rebuild the layer) ────────────────────────────

  private sync(items: GeoMapItem[], config: GeoMapConfig): void {
    const configChanged = config !== this.lastConfig;

    if (configChanged) this.applyConfig(config);

    const group: Leaflet.LayerGroup = this.clusterGroup ?? this.plainGroup;
    const seen = new Set<string>();
    const toAdd: Leaflet.Marker[] = [];
    let iconsChanged = false;

    for (const item of items) {
      if (!item.position) continue;
      seen.add(item.id);
      const prev = this.itemsById.get(item.id);

      this.itemsById.set(item.id, item);
      let marker = this.markersById.get(item.id);

      if (!marker) {
        marker = this.createMarker(item);
        this.markersById.set(item.id, marker);
        toAdd.push(marker);
        iconsChanged = true;
        continue;
      }
      if (prev === item && !configChanged) continue;
      (marker as ItemMarker).__item = item;

      if (prev?.position.lat !== item.position.lat || prev?.position.lng !== item.position.lng) {
        marker.setLatLng([item.position.lat, item.position.lng]);
      }

      if (
        configChanged ||
        prev?.categoryId !== item.categoryId ||
        this.markerLabel(prev) !== this.markerLabel(item)
      ) {
        marker.setIcon(this.buildPinIcon(item));
        this.applyStateClasses(marker, item.id);
        iconsChanged = true;
      }
    }

    const toRemove: Leaflet.Marker[] = [];

    for (const [id, marker] of this.markersById) {
      if (seen.has(id)) continue;
      toRemove.push(marker);
      this.markersById.delete(id);
      this.itemsById.delete(id);
      if (this.popupItemId === id) this.closePopup();
    }

    if (this.clusterGroup) {
      if (toRemove.length) this.clusterGroup.removeLayers(toRemove);
      if (toAdd.length) this.clusterGroup.addLayers(toAdd);
      if (iconsChanged) this.clusterGroup.refreshClusters();
    } else {
      toRemove.forEach((m) => group.removeLayer(m));
      toAdd.forEach((m) => group.addLayer(m));
    }

    // The open popup follows its item id — new object, same id, values tick live.
    if (this.popupItemId) {
      const current = this.itemsById.get(this.popupItemId);

      if (current && this.popupRef) {
        this.popupRef.setInput('item', current);
        this.popup.setLatLng([current.position.lat, current.position.lng]);
      }
    }

    this.autoFit();
    this.scheduleVisibleIds();
  }

  /** Applied on config identity change: swap cluster mode, re-icon, update popup. */
  private applyConfig(config: GeoMapConfig): void {
    const clusterWanted = config.cluster?.enabled ?? true;
    const groupExists = this.clusterGroup !== null || this.plainGroup !== null;
    const clusterActive = this.clusterGroup !== null;

    this.lastConfig = config;

    if (!groupExists || clusterWanted !== clusterActive) {
      const markers = [...this.markersById.values()];

      this.clusterGroup?.remove();
      this.plainGroup?.remove();
      this.clusterGroup = null;
      this.plainGroup = null;

      if (clusterWanted) {
        this.clusterGroup = L.markerClusterGroup({
          chunkedLoading: true,
          showCoverageOnHover: false,
          maxClusterRadius: 60,
          iconCreateFunction: (cluster) => this.buildClusterIcon(cluster),
        });
        this.clusterGroup.on('clustermouseover', (e) => {
          const cluster = e.propagatedFrom as Leaflet.MarkerCluster;

          cluster
            .bindTooltip(this.clusterBreakdown(cluster), {
              direction: 'top',
              offset: [0, -12],
            })
            .openTooltip();
        });
        if (markers.length) this.clusterGroup.addLayers(markers);
        this.map.addLayer(this.clusterGroup);
      } else {
        this.plainGroup = L.layerGroup(markers);
        this.map.addLayer(this.plainGroup);
      }
    }

    if (this.popupRef) {
      this.popupRef.setInput('sections', config.popup?.sections ?? []);
      this.popupRef.setInput('categories', this.categoriesById());
    }
    if ((config.popup?.trigger ?? 'hover') === 'off') this.closePopup();
  }

  // ── Markers ────────────────────────────────────────────────────────────────

  private markerLabel(item: GeoMapItem | undefined): string | undefined {
    const binding = this.lastConfig?.marker?.label;

    if (!item || !binding) return undefined;
    const value = resolveBinding(item, binding);

    if (value == null) return undefined;

    if (isScalar(value)) return String(value);

    return typeof value === 'object' ? JSON.stringify(value) : undefined;
  }

  private buildPinIcon(item: GeoMapItem): Leaflet.DivIcon {
    return L.divIcon({
      html: buildPinHtml({
        category: item.categoryId ? this.categoriesById().get(item.categoryId) : undefined,
        label: this.markerLabel(item),
      }),
      className: 'ps-gm-icon',
      iconSize: [PIN_WIDTH, PIN_HEIGHT],
      iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
    });
  }

  private createMarker(item: GeoMapItem): Leaflet.Marker {
    const marker = L.marker([item.position.lat, item.position.lng], {
      icon: this.buildPinIcon(item),
    });

    (marker as ItemMarker).__item = item;
    const id = item.id;

    marker.on('add', () => this.applyStateClasses(marker, id));
    marker.on('mouseover', () => this.onMarkerEnter(id));
    marker.on('mouseout', () => this.onMarkerLeave(id));
    marker.on('click', () => this.onMarkerClick(id));

    return marker;
  }

  private buildClusterIcon(cluster: Leaflet.MarkerCluster): Leaflet.DivIcon {
    const { counts, total, containsSelected } = this.aggregateCluster(cluster);
    return L.divIcon({
      html: buildClusterHtml({
        total,
        counts,
        ring: this.lastConfig?.cluster?.ring ?? true,
        containsSelected,
      }),
      className: 'ps-gm-icon',
      iconSize: [CLUSTER_SIZE, CLUSTER_SIZE],
    });
  }

  private aggregateCluster(cluster: Leaflet.MarkerCluster): {
    counts: Map<GeoMapCategory | null, number>;
    total: number;
    containsSelected: boolean;
  } {
    const categories = this.categoriesById();
    const counts = new Map<GeoMapCategory | null, number>();

    // Insertion order = config order, so ring segments are stable across clusters.
    for (const category of categories.values()) counts.set(category, 0);
    counts.set(null, 0);
    let containsSelected = false;
    const children = cluster.getAllChildMarkers();

    for (const child of children) {
      const item = (child as ItemMarker).__item;
      const category = item?.categoryId ? (categories.get(item.categoryId) ?? null) : null;

      counts.set(category, (counts.get(category) ?? 0) + 1);
      if (item && this.selectedSet.has(item.id)) containsSelected = true;
    }
    for (const [key, count] of counts) if (count === 0) counts.delete(key);

    return { counts, total: children.length, containsSelected };
  }

  private clusterBreakdown(cluster: Leaflet.MarkerCluster): string {
    const { counts, total } = this.aggregateCluster(cluster);
    const parts = [...counts]
      .map(([category, count]) => `${count} ${category?.label ?? 'uncategorized'}`)
      .join(', ');
    return `<b>${total}</b> — ${parts}`;
  }

  // ── Selection (CSS classes, never icon rebuilds → no hover flicker) ────────

  private applySelection(selected: Set<string>): void {
    const changed = new Set([...selected, ...this.selectedSet]);

    this.selectedSet = selected;

    for (const id of changed) {
      const marker = this.markersById.get(id);

      if (marker) this.applyStateClasses(marker, id);
    }
    this.clusterGroup?.refreshClusters();
  }

  private applyStateClasses(marker: Leaflet.Marker, id: string): void {
    marker.getElement()?.classList.toggle('ps-gm--selected', this.selectedSet.has(id));
  }

  // ── Popup mechanics (fixed UX — hover previews, click pins, Esc/outside closes)

  private trigger(): 'hover' | 'click' | 'off' {
    return this.lastConfig?.popup?.trigger ?? 'hover';
  }

  private onMarkerEnter(id: string): void {
    if ((this.lastConfig?.reveal ?? 'off') === 'hover') this.showReveal(id);
    if (this.trigger() === 'hover' && !this.pinned) this.showPopup(id, false);

    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private onMarkerLeave(id: string): void {
    if ((this.lastConfig?.reveal ?? 'off') === 'hover' && !this.pinned) this.hideReveal();
    if (!this.pinned && this.popupItemId === id) this.scheduleClose();
  }

  private onMarkerClick(id: string): void {
    this.selectedIds.set([id]);
    if (this.trigger() === 'off') return;

    if (this.pinned && this.popupItemId === id) {
      this.closePopup();
    } else {
      this.showPopup(id, true);
    }
  }

  private showPopup(id: string, pin: boolean): void {
    const item = this.itemsById.get(id);

    if (!item?.position || !this.lastConfig?.popup?.sections?.length || this.trigger() === 'off') {
      return;
    }

    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    if (!this.popupRef) {
      this.popupRef = this.popupHost().createComponent(GeoMapPopupComponent);
      this.popupRef.setInput('sections', this.lastConfig.popup.sections);
      this.popupRef.setInput('categories', this.categoriesById());
      this.popupRef.setInput('item', item);
      this.popupRef.instance.action.subscribe((actionId: string) =>
        this.itemAction.emit({ itemId: this.popupItemId, actionId })
      );
      this.popupRef.instance.navigate.subscribe(() =>
        this.itemNavigate.emit({ itemId: this.popupItemId })
      );
      const content = this.popupRef.location.nativeElement as HTMLElement;

      content.addEventListener('mouseenter', () => {
        if (this.closeTimer) {
          clearTimeout(this.closeTimer);
          this.closeTimer = null;
        }
      });
      content.addEventListener('mouseleave', () => {
        if (!this.pinned) this.scheduleClose();
      });
      this.popup.setContent(content);
    } else {
      this.popupRef.setInput('item', item);
    }
    this.popupRef.instance.page.set(0);
    const wasPinned = this.pinned;

    this.popupItemId = id;
    this.pinned = pin;
    this.popup.setLatLng([item.position.lat, item.position.lng]);
    if (!this.map.hasLayer(this.popup)) this.popup.openOn(this.map);
    if ((this.lastConfig.reveal ?? 'off') === 'popup' && pin) this.showReveal(id);
    if (pin && !wasPinned) this.popupOpened.emit(id);
  }

  private scheduleClose(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      if (!this.pinned) this.closePopup();
    }, 300);
  }

  // ── Reveal layer (the AREA covered by an item's children — a convex hull) ──

  private showReveal(id: string): void {
    this.hideReveal();
    const item = this.itemsById.get(id);
    const points = (item?.children ?? [])
      .filter((c) => c.position)
      .map((c) => [c.position.lat, c.position.lng] as [number, number]);

    if (points.length < 3) return;
    const category = item.categoryId ? this.categoriesById().get(item.categoryId) : undefined;
    const color = this.resolveColor(category?.color) ?? '#1776bf';

    this.revealGroup = L.layerGroup([
      L.polygon(convexHull(points), {
        interactive: false,
        color,
        weight: 2,
        dashArray: '5 5',
        fillColor: color,
        fillOpacity: 0.08,
      }),
    ]).addTo(this.map);
  }

  /** Leaflet writes path colors into SVG attributes, where var(--…) is invalid — resolve first. */
  private resolveColor(color: string | undefined): string | undefined {
    if (!color?.includes('var(')) return color;
    const el = this.container().nativeElement;
    const previous = el.style.color;

    el.style.color = color;
    const resolved = getComputedStyle(el).color;

    el.style.color = previous;

    return resolved;
  }

  private hideReveal(): void {
    this.revealGroup?.remove();
    this.revealGroup = null;
  }

  // ── Viewport ───────────────────────────────────────────────────────────────

  private scheduleVisibleIds(): void {
    if (this.visibleTimer) clearTimeout(this.visibleTimer);
    this.visibleTimer = setTimeout(() => {
      this.visibleTimer = null;
      const bounds = this.map.getBounds();
      const ids: string[] = [];

      for (const [id, item] of this.itemsById) {
        if (bounds.contains([item.position.lat, item.position.lng])) ids.push(id);
      }
      this.visibleIds.emit(ids);
    }, 200);
  }
}

/** Scalars `String()` renders meaningfully (objects are handled separately by callers). */
function isScalar(value: unknown): value is string | number | boolean | bigint {
  const kind = typeof value;
  return kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint';
}
