import { Injectable } from '@angular/core';
import { IMeasurement, MeasurementService } from '@c8y/client';
import { saveAs } from 'file-saver';
import { concatMap, from, map, Observable, switchMap } from 'rxjs';
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

  getMeasurementsWithProgress(
    source: string
  ): Observable<{ progress: number; measurements: IMeasurement[] }> {
    const filter = this.createBaseFilter(source);

    return from(this.getTotalPages(filter)).pipe(
      switchMap((totalPagesArray) => {
        const totalPages = totalPagesArray.length;

        return from(totalPagesArray).pipe(
          concatMap((currentPage) =>
            from(
              this.measurementService.list({
                ...filter,
                withTotalPages: true,
                currentPage,
              })
            ).pipe(
              map(({ data: measurements }) => ({
                progress: Math.round((currentPage / totalPages) * 100),
                measurements,
              }))
            )
          )
        );
      })
    );
  }

  prepare(measurements: IMeasurement[]): string {
    const jsonRows = measurements.map((m) => {
      const json: Record<string, unknown> = {};
      const paths = this.detectMeasurementPaths(m);

      for (const path of paths) {
        const measurementValue = get(m, path) as { value: unknown };

        json[path] = measurementValue.value;
      }

      return json;
    });
    const csv = this.jsonToCsv(jsonRows);
    return csv;
  }

  private detectMeasurementPaths(m: IMeasurement): string[] {
    const nope = ['id', 'type', 'time', 'self', 'source'];
    const result: string[] = [];
    const fragmentCandidates = Object.keys(m).filter((key) => !nope.includes(key));

    for (const key of fragmentCandidates) {
      const fragment = get(m, key) as Record<string, unknown>;
      const nestedKeys = Object.keys(fragment);

      for (const nestedKey of nestedKeys) {
        if (has(fragment, `${nestedKey}.value`)) {
          result.push(`${key}.${nestedKey}`);
        }
      }
    }

    return result;
  }

  private jsonToCsv(jsonData: Record<string, unknown>[]): string {
    if (jsonData.length === 0) {
      throw new Error('The input JSON is empty.');
    }

    const headers = Object.keys(jsonData[0]);
    const csvRows = [];

    csvRows.push(headers.join(','));
    jsonData.forEach((item) => {
      const row = headers
        .map((header) => {
          const value = item[header] as string | number | boolean | null | undefined;
          return !isNil(value) ? `"${value}"` : '';
        })
        .join(',');

      csvRows.push(row);
    });

    return csvRows.join('\n');
  }

  download(text: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });

    saveAs(blob, `measurements-${new Date().toISOString()}.csv`);
  }
}
