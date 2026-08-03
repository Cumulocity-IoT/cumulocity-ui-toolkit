import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CoreModule, ModalLabels } from '@c8y/ngx-components';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { CustomBaseTileLayerEntry } from '../base-tile-layers';

@Component({
  selector: 'ps-custom-base-layer-modal',
  standalone: true,
  imports: [CoreModule, FormsModule],
  template: `
    <c8y-modal
      [title]="title | translate"
      [labels]="labels"
      [disabled]="!entry.label || !entry.url"
      (onClose)="onClose()"
      (onDismiss)="onDismiss()"
    >
      <div class="m-16">
        <div class="form-group">
          <label class="control-label" translate>Name</label>
          <input
            class="form-control"
            [(ngModel)]="entry.label"
            [placeholder]="'e.g. Company WMS' | translate"
            type="text"
          />
        </div>

        <div class="form-group">
          <label class="control-label" translate>Tile URL</label>
          <input
            class="form-control"
            [(ngModel)]="entry.url"
            type="url"
            placeholder="https://example.com/tiles/{z}/{x}/{y}.png"
          />
          <p class="help-block">
            Use <code>&#123;z&#125;</code>, <code>&#123;x&#125;</code>,
            <code>&#123;y&#125;</code> as placeholders. ESRI endpoints use
            <code>&#123;z&#125;/&#123;y&#125;/&#123;x&#125;</code>.
          </p>
        </div>

        <div class="form-group">
          <label class="control-label" translate
            >Attribution <small class="text-muted" translate>(optional)</small></label
          >
          <input
            class="form-control"
            [(ngModel)]="entry.attribution"
            [placeholder]="'© Map Provider' | translate"
            type="text"
          />
        </div>

        <div class="row">
          <div class="col-xs-6">
            <div class="form-group">
              <label class="control-label" translate
                >Max zoom <small class="text-muted">(optional, default 19)</small></label
              >
              <input
                class="form-control"
                [(ngModel)]="entry.maxZoom"
                type="number"
                min="1"
                max="22"
                placeholder="19"
              />
            </div>
          </div>
          <div class="col-xs-6">
            <div class="form-group">
              <label class="control-label" translate
                >Subdomains <small class="text-muted">(optional, default abc)</small></label
              >
              <input
                class="form-control"
                [(ngModel)]="entry.subdomains"
                type="text"
                placeholder="abc"
              />
              <p class="help-block">
                Single string of subdomain characters, e.g. <code>abcd</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </c8y-modal>
  `,
})
export class CustomBaseLayerModalComponent {
  title = 'Custom base layer';
  labels: ModalLabels = { ok: 'Save', cancel: 'Cancel' };

  entry: CustomBaseTileLayerEntry = { id: '', label: '', url: '' };

  closeSubject = new Subject<CustomBaseTileLayerEntry | undefined>();

  constructor(public bsModalRef: BsModalRef) {}

  setEntry(entry: CustomBaseTileLayerEntry): void {
    this.entry = { ...entry };
    this.title = 'Edit base layer';
  }

  onClose(): void {
    this.closeSubject.next(this.entry);
  }

  onDismiss(): void {
    this.closeSubject.next(undefined);
  }
}
