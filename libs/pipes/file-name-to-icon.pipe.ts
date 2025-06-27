import { Pipe, PipeTransform } from '@angular/core';
import { get } from 'lodash';

@Pipe({ name: 'fileNameToIcon' })
export class FileNameToIconPipe implements PipeTransform {
  fileTypeIconsMap: { [key: string]: string[] } = {
    'file-archive-o': ['7z', 'apk', 'cab', 'gz', 'iso', 'jar', 'rar', 'tar', 'zip'],
    excel: ['xls', 'xlsx'],
    'image-file': ['bmp', 'gif', 'png', 'svg', 'ico'],
    jpg: ['jpeg', 'jpg'],
    tif: ['tiff'],
    pdf: ['pdf'],
    ppt: ['ppt', 'pptx'],
    'file-text': ['txt'],
    'file-video-o': ['3gp', 'asf', 'avi', 'flv', 'mov', 'mp4', 'ogv', 'qt', 'rm', 'rmvb', 'wmv'],

    word: ['doc', 'docx'],
  };

  fileNameRegexp = /(?:\.([^.]+))?$/;

  /**
   * Returns the icon for a specific binary.
   */
  transform(name: string): string {
    if (!name) {
      return 'file';
    }

    const [, suffix] = this.fileNameRegexp.exec(name);

    for (const icon of Object.keys(this.fileTypeIconsMap)) {
      if (get(this.fileTypeIconsMap, icon).includes(suffix)) {
        return icon;
      }
    }

    return 'file';
  }
}
