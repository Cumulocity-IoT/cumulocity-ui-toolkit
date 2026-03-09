import { inject, Injectable } from '@angular/core';
import { IMeasurement, IResultList, MeasurementService } from '@c8y/client';

@Injectable({ providedIn: 'root' })
export class RadialGaugeService {
  private measurementService = inject(MeasurementService);

  async fetchLatestMeasurement(
    deviceId: string,
    fragment: string
  ): Promise<IResultList<IMeasurement>> {
    return await this.measurementService.list({
      source: deviceId,
      type: fragment,
      dateFrom: '1970-01-01',
      revert: true,
      pageSize: 1,
    });
  }
}
