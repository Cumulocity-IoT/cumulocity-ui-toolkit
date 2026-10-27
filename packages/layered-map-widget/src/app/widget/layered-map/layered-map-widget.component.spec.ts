import { TestBed } from '@angular/core/testing';
import { LayeredMapWidgetComponent } from './layered-map-widget.component';
import { AlarmPollingService } from './service/alarm-polling.service';
import { CustomBaseTileLayerService } from './service/custom-base-tile-layer.service';
import { EventPollingService } from './service/event-polling.service';
import { InventoryPollingService } from './service/inventory-polling.service';
import { LayerService } from './service/layer.service';
import { PositionPollingService } from './service/position-polling.service';

const frames = () => new Promise((resolve) => setTimeout(resolve, 100));

describe('LayeredMapWidgetComponent', () => {
  it('re-measures the map when the widget is resized (drag, size preset, fullscreen)', async () => {
    TestBed.configureTestingModule({
      imports: [LayeredMapWidgetComponent],
      providers: [
        { provide: LayerService, useValue: { tearDown: () => undefined } },
        { provide: CustomBaseTileLayerService, useValue: {} },
      ],
    }).overrideComponent(LayeredMapWidgetComponent, {
      set: {
        imports: [],
        template: '',
        providers: [
          { provide: InventoryPollingService, useValue: {} },
          { provide: AlarmPollingService, useValue: {} },
          { provide: EventPollingService, useValue: {} },
          { provide: PositionPollingService, useValue: {} },
        ],
      },
    });

    const component = TestBed.createComponent(LayeredMapWidgetComponent).componentInstance;
    const invalidateSize = jasmine.createSpy('invalidateSize');
    const container = document.createElement('div');

    container.style.width = '200px';
    container.style.height = '100px';
    document.body.appendChild(container);

    try {
      component.map = {
        invalidateSize,
        clearAllEventListeners: () => undefined,
        remove: () => undefined,
      } as never;
      (
        component as unknown as { observeContainerSize(el: HTMLElement): void }
      ).observeContainerSize(container);
      await frames();
      invalidateSize.calls.reset();

      // the dashboard changes the widget's size — the window does not resize
      container.style.width = '400px';
      await frames();

      expect(invalidateSize).toHaveBeenCalled();
    } finally {
      component.ngOnDestroy();
      container.remove();
    }
  });
});
