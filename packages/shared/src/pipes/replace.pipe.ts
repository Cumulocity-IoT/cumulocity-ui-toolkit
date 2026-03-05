import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'replace',
})
export class ReplacePipe implements PipeTransform {
  transform(value: string, searchStr: string, replaceStr = ''): string {
    return value.split(searchStr).join(replaceStr);
  }
}
