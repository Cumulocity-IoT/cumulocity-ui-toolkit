import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'nl2br',
  standalone: false,
})
export class Nl2brPipe implements PipeTransform {
  transform(value: string): string {
    const regEx = /\n/g;

    return value.replace(regEx, '<br>');
  }
}
