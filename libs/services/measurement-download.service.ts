import { Injectable } from '@angular/core';
import { IMeasurement, MeasurementService } from '@c8y/client';
import { saveAs } from 'file-saver';
import { from, Observable } from 'rxjs';
import { get, has, isNil } from 'lodash';

@Injectable()
export class MeasurementDownloadService {
  constructor(private measurementService: MeasurementService) {}

  private createBaseFilter(source: string) {
    return {
      dateFrom: new Date(0).toISOString(),
      dateTo: new Date().toISOString(),
      source,
      pageSize: 2000,
    };
  }

  private async getTotalPages(filter: object): Promise<number[]> {
    const { paging: measurementPaging } = await this.measurementService.list({
      ...filter,
      withTotalPages: true,
      pageSize: 1,
    });

    const totalMeasurements = measurementPaging.totalPages;
    const maxPageSize = 2000;

    const requestsNeeded = Math.ceil(totalMeasurements / maxPageSize);
    const totalPages = Array.from({ length: requestsNeeded }, (_, index) => index + 1);
    return totalPages;
  }

  getMeasurementsWithProgress(source: string): Observable<{ progress: number; measurements: IMeasurement[] }> {
    return new Observable((subscriber) => {
      const filter = this.createBaseFilter(source);

      from(this.getTotalPages(filter)).subscribe({
        next: async (totalPagesArray) => {
          const totalPages = totalPagesArray.length;
          for (const currentPage of totalPagesArray) {
            try {
              const { data: measurements } = await this.measurementService.list({
                ...filter,
                withTotalPages: true,
                currentPage,
              });

              subscriber.next({
                progress: Math.round((currentPage / totalPages) * 100),
                measurements,
              });
            } catch (error) {
              subscriber.error(error);
              return;
            }
          }

          subscriber.complete();
        },
        error: (err) => {
          subscriber.error(err);
        },
      });
    });
  }

  prepare(measurements: IMeasurement[]): string {
    const jsonRows = measurements.map((m) => {
      let json = {};
      const paths = this.detectMeasurementPaths(m);
      for (const path of paths) {
        json[path] = get(m, path).value;
      }
    });
    const csv = this.jsonToCsv(jsonRows);
    return csv;
  }

  private detectMeasurementPaths(m: IMeasurement): string[] {
    const nope = ['id', 'type', 'time', 'self', 'source'];
    const result: string[] = [];
    const fragmentCandidates = Object.keys(m).filter((key) => !nope.includes(key));
    for (const key of fragmentCandidates) {
      const fragment = get(m, key);
      const nestedKeys = Object.keys(fragment);
      for (const nestedKey of nestedKeys) {
        if (has(fragment, `${nestedKey}.value`)) {
          result.push(`${key}.${nestedKey}`);
        }
      }
    }
    return result;
  }

  private jsonToCsv(jsonData: any[]): string {
    if (jsonData.length === 0) {
      throw new Error('The input JSON is empty.');
    }

    const headers = Object.keys(jsonData[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));
    jsonData.forEach((item) => {
      const row = headers
        .map((header) => {
          const value = item[header];
          return !isNil(value) ? `"${value}"` : '';
        })
        .join(',');
      csvRows.push(row);
    });

    return csvRows.join('\n');
  }

  download(text: string) {
    let blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `measurements-${new Date().toISOString()}.csv`);
  }
}
