import { ChangeDetectionStrategy, Component, EventEmitter, input, Output } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { PSQueryDisplayComponent } from '~components/query-display/ps-query-display.component';
import { BasicLayerConfig, isQueryLayerConfig, LayerConfig } from '../layered-map-widget.model';
import { filterToQueryString } from '../utils/filter-to-query';
@Component({
  templateUrl: './layer-list.component.html',
  selector: 'layer-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CoreModule, PSQueryDisplayComponent],
})
export class LayerListComponent {
  @Output() deleteLayer = new EventEmitter<LayerConfig<BasicLayerConfig>>();
  @Output() editLayer = new EventEmitter<LayerConfig<BasicLayerConfig>>();
  @Output() editPopover = new EventEmitter<LayerConfig<BasicLayerConfig>>();

  @Output() activeLayerChange = new EventEmitter<{
    checked: boolean;
    config: LayerConfig<BasicLayerConfig>;
  }>();

  layers = input<LayerConfig<BasicLayerConfig>[]>([]);

  onUserChangedSelection(event: Event, config: LayerConfig<BasicLayerConfig>): void {
    const checked = (<HTMLInputElement>event.currentTarget).checked;

    // this.activeLayerChange.emit({
    //   checked,
    //   config,
    // });
    config.active = checked;
  }

  onEditLayer(config: LayerConfig<BasicLayerConfig>): void {
    this.editLayer.emit(config);
  }

  onEditPopover(config: LayerConfig<BasicLayerConfig>): void {
    this.editPopover.emit(config);
  }

  onDeleteLayer(config: LayerConfig<BasicLayerConfig>): void {
    this.deleteLayer.emit(config);
  }

  getContent(layer: LayerConfig<BasicLayerConfig>): string {
    const cfg = layer.config;

    if (isQueryLayerConfig(cfg)) {
      return `${cfg.type} with query ${JSON.stringify(cfg.filter)}`;
    }

    return '';
  }

  /** Short type label shown next to the visualised query. */
  getQueryType(layer: LayerConfig<BasicLayerConfig>): string {
    const cfg = layer.config;
    return isQueryLayerConfig(cfg) ? cfg.type : '';
  }

  /** Builds a query string from the layer's filter for the `ps-query-display` component. */
  getQuery(layer: LayerConfig<BasicLayerConfig>): string {
    const cfg = layer.config;

    return isQueryLayerConfig(cfg)
      ? filterToQueryString(cfg.filter as Record<string, unknown>)
      : '';
  }
}
