import {
  inject,
  model,
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { fromEvent, Subject, takeUntil } from 'rxjs';
import { CoreModule, ModalLabels } from '@c8y/ngx-components';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { LocationGeocoderService } from '~services/location-geocoder.service';
import type * as L from 'leaflet';
import { isNil } from 'lodash';
import { MapService } from '@c8y/ngx-components/map';
import { OSM_TILE_OPTIONS, OSM_TILE_URL } from '../base-tile-layers';

@Component({
  providers: [LocationGeocoderService],
  styleUrls: ['./center-map-modal.component.less'],
  templateUrl: './center-map-modal.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class CenterMapModalComponent implements AfterViewInit, OnDestroy {
  leaf!: typeof L;
  map?: L.Map;
  @ViewChild('centerMap', { read: ElementRef, static: true }) mapReference!: ElementRef;
  private destroy$ = new Subject<void>();

  title = 'Configure your maps bounds and zoom-level';
  closeSubject: Subject<
    | {
        lat: number;
        long: number;
        zoomLevel: number;
      }
    | undefined
  > = new Subject();

  labels: ModalLabels = {
    ok: 'Save',
    cancel: 'Cancel',
  };

  center = model<{
    lat: number;
    long: number;
    zoomLevel: number;
  }>({ lat: 51.505, long: -0.09, zoomLevel: 13 });

  public bsModalRef = inject(BsModalRef);

  private geo = inject(LocationGeocoderService);

  private mapService = inject(MapService);

  ngAfterViewInit(): void {
    void this.initAfterView();
  }

  private async initAfterView(): Promise<void> {
    this.leaf = await this.mapService.getLeaflet();
    const options: L.MapOptions = {
      zoom: 15,
      layers: [this.leaf.tileLayer(OSM_TILE_URL, { ...OSM_TILE_OPTIONS })],
      center: this.leaf.latLng(51.23544, 6.79599), // Düsseldorf
      attributionControl: false,
      scrollWheelZoom: false,
    };

    this.map = this.leaf
      .map(this.mapReference.nativeElement as HTMLElement, options)
      .setView(this.leaf.latLng(51.505, -0.09), 13);

    const { lat, long, zoomLevel } = this.center();

    if (lat && long && zoomLevel) {
      const bounds = this.leaf.latLng(lat, long);

      this.map.setView(bounds, zoomLevel);
    }

    fromEvent<L.LeafletEvent>(this.map, 'zoomend')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const zoom = this.map?.getZoom();

        if (zoom !== undefined) {
          this.patchCenter({ zoomLevel: zoom });
        }
      });

    fromEvent<L.DragEndEvent>(this.map, 'dragend')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const center = this.map?.getCenter();

        if (center) {
          this.patchCenter({ lat: center.lat, long: center.lng });
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // The component creates this map itself, so it also has to release it —
    // otherwise every open/close of the dialog leaks a Leaflet instance.
    this.map?.remove();
    this.map = undefined;
  }

  onMapReady(map: L.Map): void {
    this.map = map;
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 1000);
  }

  onUserChangedZoomLevel(): void {
    this.map?.setZoom(this.center().zoomLevel);
  }

  async navigateToAddress(address: string): Promise<void> {
    const { lat, lon } = await this.geo.geoCode(address);

    if (!isNil(lat) && !isNaN(lat) && !isNil(lon) && !isNaN(lon)) {
      this.map?.flyTo([lat, lon], this.center().zoomLevel, { duration: 1 });
      this.patchCenter({ lat, long: lon });
    }
  }

  detectUserLocation(): void {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;

        this.patchCenter({ lat: latitude, long: longitude });
        this.map?.flyTo([latitude, longitude], this.center().zoomLevel, { duration: 1 });
      });
    }
  }

  /**
   * Updates the `center` model by emitting a new object rather than mutating the
   * value in place — the model is owned by the parent, so in-place writes would
   * bypass Angular's change-detection contract for the two-way binding.
   */
  patchCenter(patch: Partial<{ lat: number; long: number; zoomLevel: number }>): void {
    this.center.update((center) => ({ ...center, ...patch }));
  }

  // - MODAL section

  // called if cancel is pressed
  onDismiss(): void {
    this.closeSubject.next(undefined);
  }

  // called if save is pressed
  onClose(): void {
    this.closeSubject.next(this.center());
  }
}
