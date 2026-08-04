import { inject, AfterViewInit, Component } from '@angular/core';
import { Subject } from 'rxjs';
import { CoreModule, ModalLabels } from '@c8y/ngx-components';
import {
  latLng,
  LatLng,
  LeafletMouseEvent,
  Map as LMap,
  MapOptions,
  polyline,
  Polyline,
  tileLayer,
} from 'leaflet';
import { isEmpty } from 'lodash';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { LocationGeocoderService } from '~services/location-geocoder.service';
import { ITrack } from '../layered-map-widget.model';
import { OSM_TILE_OPTIONS, OSM_TILE_URL } from '../base-tile-layers';

@Component({
  providers: [LocationGeocoderService],
  templateUrl: './draw-line-creator-modal.component.html',
  styleUrls: ['./draw-line-creator-modal.component.less'],
  standalone: true,
  imports: [CoreModule],
})
export class DrawLineCreatorModalComponent implements AfterViewInit {
  title = 'Create track';
  closeSubject: Subject<ITrack | null> = new Subject();
  labels: ModalLabels = {
    ok: 'Create',
    cancel: 'Cancel',
  };

  isDrawingLine = false;
  mouseLines: Polyline[] = [];

  coordinates: LatLng[] = [];
  line: Polyline;
  mouseMoveLine: Polyline | null = null;

  trackName: string;

  options: MapOptions = {
    layers: [tileLayer(OSM_TILE_URL, { ...OSM_TILE_OPTIONS, opacity: 0.7 })],
    zoom: 1,
    center: latLng(0, 0),
    attributionControl: false,
  };

  map: LMap;

  public bsModalRef = inject(BsModalRef);

  private geo = inject(LocationGeocoderService);

  ngAfterViewInit(): void {
    this.map.invalidateSize();
  }

  onMapReady(map: LMap): void {
    this.map = map;
  }

  async navigateToAddress(address: string): Promise<void> {
    const { lat, lon } = await this.geo.geoCode(address);

    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
      this.map.flyTo([lat, lon], 17, { duration: 1 });
    }
  }

  startDrawingLine(): void {
    this.isDrawingLine = true;
    this.setMapCursor('crosshair');
    this.map.dragging?.disable();
  }

  pauseDrawingLine(): void {
    this.isDrawingLine = false;
    this.setMapCursor('');
    this.map.dragging?.enable();
  }

  private setMapCursor(cursor: string): void {
    const container = document.getElementById('draw-line-map');

    if (container) {
      container.style.cursor = cursor;
    }
  }

  resetLine(): void {
    this.coordinates = [];

    if (!isEmpty(this.mouseLines)) {
      this.mouseLines.forEach((line) => line.removeFrom(this.map));
      this.mouseLines = [];
    }

    if (this.mouseMoveLine) {
      this.mouseMoveLine.removeFrom(this.map);
      this.mouseMoveLine = null;
    }
  }

  onMouseDown(event: LeafletMouseEvent): void {
    if (this.isDrawingLine) {
      this.coordinates.push(event.latlng);
      const length = this.coordinates.length;

      if (length > 1) {
        const line = polyline([this.coordinates[length - 2], event.latlng]);

        line.addTo(this.map);
        this.mouseLines.push(line);
      }
    }
  }

  onMouseMove(event: LeafletMouseEvent): void {
    if (this.isDrawingLine) {
      if (!isEmpty(this.coordinates)) {
        const last = this.coordinates[this.coordinates.length - 1];

        if (this.mouseMoveLine) {
          this.mouseMoveLine.removeFrom(this.map);
        }
        this.mouseMoveLine = polyline([last, event.latlng]);
        this.mouseMoveLine.addTo(this.map);
      }
    }
  }

  onMouseOut(): void {
    if (this.isDrawingLine && this.mouseMoveLine) {
      this.mouseMoveLine.removeFrom(this.map);
      this.mouseMoveLine = null;
    }
  }

  // - MODAL section

  // called if cancel is pressed
  onDismiss(): void {
    this.closeSubject.next(null);
  }

  // called if save is pressed
  onClose(): void {
    this.pauseDrawingLine();

    this.closeSubject.next({
      name: this.trackName,
      coords: this.coordinates,
      createDate: new Date(),
    });
  }
}
