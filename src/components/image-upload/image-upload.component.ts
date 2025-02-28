import { Component, EventEmitter, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IManagedObjectBinary, InventoryBinaryService } from '@c8y/client';
import { AlertService, CommonModule, CoreModule, DropAreaComponent, DroppedFile } from '@c8y/ngx-components';
import { isNil } from 'lodash';

@Component({
  selector: 'image-upload',
  templateUrl: './image-upload.component.html',
  standalone: true,
  imports: [CoreModule, CommonModule, FormsModule],
})
export class ImageUploadComponent {
  selectedFile?: File;
  isLoading = false;
  @ViewChild('fileUpload') fileUpload!: DropAreaComponent;
  FILE_SIZE_LIMIT = 1024 * 1024 * 100;

  @Output() imageUploaded = new EventEmitter<IManagedObjectBinary>();

  constructor(private binaryService: InventoryBinaryService, private alert: AlertService) {}

  onFileDropped(droppedFiles?: DroppedFile[]) {
    if (isNil(droppedFiles)) {
      this.selectedFile = undefined;
      return;
    }

    if (droppedFiles.length > 1) {
      this.alert.danger('Upload of multiple files is not allowed');
      this.resetFileUpload();
      return;
    }
    const [file] = droppedFiles;
    if (file.file.size > this.FILE_SIZE_LIMIT) {
      this.alert.danger(`Maximum file size of ${this.FILE_SIZE_LIMIT / (1024 * 1024)} MB exceeded!`);
      this.resetFileUpload();
      return;
    }
    this.selectedFile = file.file;

    this.isLoading = true;
    this.binaryService
      .create(file.file)
      .then((result) => {
        this.imageUploaded.emit(result.data);
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  private resetFileUpload() {
    this.selectedFile = undefined;
    // @ts-ignore
    delete this.fileUpload.files;
    this.fileUpload.filesNameString = '';
    // @ts-ignore
    delete this.fileUpload.errorMessage;
    this.fileUpload.errors = false;
  }
}
