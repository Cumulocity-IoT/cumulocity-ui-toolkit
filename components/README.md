# Components

## Alarm Icon

TODO: Add image here

## Device Selector Modal

<img src="device-selector-modal/example.png" width="800" />

Within your module add the standalone component to the imports:

```typescript
import { ModalModule } from 'ngx-bootstrap/modal';
import { DeviceSelectorModalComponent } from './device-selector-modal.component';

@NgModule({
  declarations: [...],
  providers: [...],
  imports: [
    ModalModule,
    DeviceSelectorModalComponent,
  ]
});
```

In your components code, open it like this:

```typescript
constructor(public inventory: InventoryService, private modalService: BsModalService) {}

openAssignDevicesModal() {
    const modal = this.modalService.show(DeviceSelectorModalComponent, { class: 'modal-lg' });
    modal.content?.closeSubject.subscribe((res) => {
      if (res) {
        this.inventory
          .list({
            pageSize: 2000,
            ids: res.map(iid => iid.id!).join(','),
          })
          .then((res) => {
            // do whatever you want to do with res.data
          });
      }
    });
  }
```
## Image Upload

<img src="image-upload/example.png" width="400" />

Within your module add the standalone component to the imports:

```typescript
@NgModule({
  declarations: [...],
  providers: [...],
  imports: [
    ImageUploadComponent
  ]
});
```

In your components HTML, add the following:

```typescript
<image-upload (imageUploaded)="onImageUploaded($event)"></image-upload>
```
