import { ApplicationRef, ComponentRef, createComponent, Injectable } from '@angular/core';
import { PopupComponent } from '../popup/popup.component';
import { MyLayer } from '../layered-map-widget.model';
import { Marker } from 'leaflet';

@Injectable({ providedIn: 'root' })
export class PopUpService {
  constructor(private applicationRef: ApplicationRef) {}

  getPopup(popupData: { deviceId: string; layer: MyLayer }): {
    html: HTMLElement;
    ref: ComponentRef<PopupComponent>;
  } {
    const popup = document.createElement('popup-component');

    const popupComponentRef = createComponent(PopupComponent, {
      environmentInjector: this.applicationRef.injector,
      hostElement: popup,
    });

    this.applicationRef.attachView(popupComponentRef.hostView);
    popupComponentRef.setInput('content', popupData);

    return { html: popup, ref: popupComponentRef };
  }

  getPopupComponent(marker: Marker): PopupComponent | undefined {
    return this.getRef(marker)?.instance;
  }

  /**
   * Destroys the Angular component backing a marker's popup and detaches its
   * view from the {@link ApplicationRef} change-detection loop. Markers created
   * by the layer service attach a popup component per marker; without this the
   * component (and its change-detection ticks) would leak when the marker is
   * removed or the widget is torn down.
   */
  destroyPopup(marker: Marker): void {
    const ref = this.getRef(marker);

    if (ref) {
      this.applicationRef.detachView(ref.hostView);
      ref.destroy();
    }

    marker.unbindPopup();
  }

  private getRef(marker: Marker): ComponentRef<PopupComponent> | undefined {
    const popup = marker.getPopup() as unknown as
      | { ref?: ComponentRef<PopupComponent> }
      | undefined;

    return popup?.ref;
  }
}
