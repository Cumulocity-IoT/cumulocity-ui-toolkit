import { Pipe, PipeTransform } from '@angular/core';

const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
// Must stay index-aligned with FILE_SIZE_UNITS: 'Terabytes' used to be missing,
// which shifted every long-form label from megabytes upwards by one unit.
const FILE_SIZE_UNITS_LONG = [
  'Bytes',
  'Kilobytes',
  'Megabytes',
  'Gigabytes',
  'Terabytes',
  'Petabytes',
  'Exabytes',
  'Zettabytes',
  'Yottabytes',
];

@Pipe({
  name: 'formatFileSize',
  standalone: true,
})
export class FormatFileSizePipe implements PipeTransform {
  /**
   * Returns the file size as a user friendly string.
   *
   * @param sizeInBytes the size in bytes
   * @param longForm whether to spell the unit out ('Kilobytes' instead of 'KB')
   */
  transform(sizeInBytes: number, longForm?: boolean): string {
    const units = longForm ? FILE_SIZE_UNITS_LONG : FILE_SIZE_UNITS;

    // `Math.log(0)` is -Infinity, which produced a `NaN` size.
    if (!sizeInBytes || sizeInBytes <= 0 || !Number.isFinite(sizeInBytes)) {
      return `0 ${units[0]}`;
    }

    const power = Math.min(
      Math.max(Math.round(Math.log(sizeInBytes) / Math.log(1024)), 0),
      units.length - 1
    );

    const size = sizeInBytes / Math.pow(1024, power); // size in new units
    const formattedSize = Math.round(size * 100) / 100; // keep up to 2 decimals

    return `${formattedSize} ${units[power]}`;
  }
}
