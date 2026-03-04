import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CoreModule, FormsModule } from '@c8y/ngx-components';
import { MapService } from '@c8y/ngx-components/map';
import * as L from 'leaflet';
import { Subject } from 'rxjs';
import { set } from 'lodash';

@Component({
  selector: 'ps-heatmap',
  template: `<div class="c8y-map">
    <div class="heatmap-container" #heatMap></div>
  </div> `,
  styleUrls: ['./ps-heatmap.component.css'],
  standalone: true,
  imports: [CommonModule, CoreModule, FormsModule],
})
export class HeatmapComponent implements OnInit, OnDestroy {
  private map!: L.Map;

  @Input() options!: L.MapOptions;
  @Input() blurRadius = 18;

  @ViewChild('heatMap', { read: ElementRef, static: true }) mapReference!: ElementRef;

  /**
   * An array containing lat and lng coordinates and the value for each coordinate which needs to be between 0 (green) and 100 (red).
   */
  @Input() set data(value: { lat: number; lng: number; value: number }[]) {
    if (this.heatLayer) {
      this.map.removeLayer(this.heatLayer);
    }

    if (value?.length) {
      this.addHeatLayer(value);
    }
  }

  private destroy$ = new Subject<void>();
  heatLayer!: L.GridLayer;
  l!: typeof L;

  constructor(private mapService: MapService) {}

  async ngOnInit(): Promise<void> {
    this.l = await this.mapService.getLeaflet();
    this.initMap();
  }

  private initMap(): void {
    const baseLayer = this.l.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      ...this.options,
      className: 'bw-layer',
    });

    this.map = this.l.map(this.mapReference.nativeElement, {
      ...this.options,
      layers: [baseLayer],
    });

    setTimeout(() => {
      const bwLayerElement = document.querySelector('div.leaflet-layer.bw-layer');

      if (bwLayerElement) {
        bwLayerElement.style.filter = 'grayscale(100%)';
      }
    }, 100);
  }

  private addHeatLayer(data: { lat: number; lng: number; value: number }[]) {
    this.heatLayer = this.l.gridLayer({ className: 'heat-layer' });

    const createTile = (coords: L.Coords) => {
      const tile = L.DomUtil.create('canvas', 'leaflet-tile');
      const ctx = tile.getContext('2d');
      const size = this.heatLayer.getTileSize();

      tile.width = size.x;
      tile.height = size.y;

      const subTileSize = size.x / 4;

      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const x = i * subTileSize;
          const y = j * subTileSize;

          const subTilePoint = this.l.point(x, y);
          const nwPoint = coords.scaleBy(size).add(subTilePoint);
          const nw = this.map.unproject(nwPoint, coords.z);
          const sePoint = nwPoint.add(this.l.point(subTileSize, subTileSize));
          const se = this.map.unproject(sePoint, coords.z);
          const subTileBounds = this.l.latLngBounds(nw, se);

          const posInSubTile = data.filter((pos) => {
            const latLng = this.l.latLng(pos.lat, pos.lng);
            return subTileBounds.contains(latLng);
          });

          if (posInSubTile.length) {
            const averageValue =
              posInSubTile.reduce((sum, pos) => sum + pos.value, 0) / posInSubTile.length;
            const rgb = this.getRGBForValue(averageValue);

            ctx!.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.9)`;
            ctx!.fillRect(x, y, subTileSize, subTileSize);
          }
        }
      }

      return tile;
    };

    set(this.heatLayer, 'createTile', createTile);
    this.heatLayer.addTo(this.map);

    setTimeout(() => {
      const bwLayerElement = document.querySelector('div.leaflet-layer.heat-layer');

      if (bwLayerElement) {
        bwLayerElement.style.filter = `blur(${this.blurRadius}px)`;
      }
    }, 100);

    const bounds = this.l.latLngBounds(data.map((d) => [d.lat, d.lng]));

    this.map.fitBounds(bounds);
  }

  private getRGBForValue(value: number): [number, number, number] {
    if (value < 0) value = 0;
    if (value > 100) value = 100;

    const green: [number, number, number] = [0, 128, 1]; // #008001
    const yellow: [number, number, number] = [255, 255, 0];
    const red: [number, number, number] = [255, 0, 0]; // #FF0000

    if (value <= 20) {
      return green;
    } else if (value <= 50) {
      const t = (value - 20) / (50 - 20);
      return this.interpolateColor(green, yellow, t);
    } else if (value <= 100) {
      const t = (value - 50) / (100 - 50);
      return this.interpolateColor(yellow, red, t);
    } else {
      return red;
    }
  }

  private interpolateColor(
    from: [number, number, number],
    to: [number, number, number],
    t: number
  ): [number, number, number] {
    const r = Math.round(from[0] + (to[0] - from[0]) * t);
    const g = Math.round(from[1] + (to[1] - from[1]) * t);
    const b = Math.round(from[2] + (to[2] - from[2]) * t);
    return [r, g, b];
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.off();
      this.map.remove();
    }
    this.map?.clearAllEventListeners();
    this.destroy$.next();
  }
}
