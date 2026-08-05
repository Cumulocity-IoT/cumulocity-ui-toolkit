import { MeasurementService } from '@c8y/client';
import { firstValueFrom } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { MeasurementDownloadService } from './measurement-download.service';
import { createService } from '~helpers/create-service.helper';

describe('MeasurementDownloadService', () => {
  it('prepares CSV output from measurements', () => {
    const service = createService(MeasurementDownloadService, [
      { provide: MeasurementService, useValue: {} as MeasurementService },
    ]);

    const csv: any = service.prepare([
      {
        c8y_Temperature: { T: { value: 21 } },
        c8y_Humidity: { H: { value: 70 } },
      } as any,
    ]);

    expect(csv).toBe('c8y_Temperature.T,c8y_Humidity.H\n"21","70"');
  });

  it('throws for empty prepare input', () => {
    const service = createService(MeasurementDownloadService, [
      { provide: MeasurementService, useValue: {} as MeasurementService },
    ]);

    expect(() => service.prepare([])).toThrowError(/The input JSON is empty/);
  });

  it('emits measurements with progress for each page batch', async () => {
    const list = jasmine
      .createSpy('list')
      .and.returnValues(
        Promise.resolve({ paging: { totalPages: 4001 } }),
        Promise.resolve({ data: [{ id: 'm1' }] }),
        Promise.resolve({ data: [{ id: 'm2' }] }),
        Promise.resolve({ data: [{ id: 'm3' }] })
      );
    const service = createService(MeasurementDownloadService, [
      { provide: MeasurementService, useValue: { list } },
    ]);

    const emissions = await firstValueFrom(
      service.getMeasurementsWithProgress('device-1').pipe(toArray())
    );

    expect(emissions.map((e) => e.progress)).toEqual([33, 67, 100]);
    expect(emissions.flatMap((e) => e.measurements.map((m) => (m as any).id))).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('downloads CSV text as a file', () => {
    const service = createService(MeasurementDownloadService, [
      { provide: MeasurementService, useValue: {} as MeasurementService },
    ]);

    expect(() => {
      service.download('x,y\n1,2');
    }).not.toThrow();
  });
});
