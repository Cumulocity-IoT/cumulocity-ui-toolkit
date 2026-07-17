import { MeasurementService } from '@c8y/client';
import { firstValueFrom } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { MeasurementDownloadService } from './measurement-download.service';

describe('MeasurementDownloadService', () => {
  it('prepares CSV output from measurements', () => {
    const service = new MeasurementDownloadService({} as MeasurementService);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const csv: any = service.prepare([
      {
        c8y_Temperature: { T: { value: 21 } },
        c8y_Humidity: { H: { value: 70 } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);

    expect(csv).toBe('c8y_Temperature.T,c8y_Humidity.H\n"21","70"');
  });

  it('throws for empty prepare input', () => {
    const service = new MeasurementDownloadService({} as MeasurementService);

    expect(() => service.prepare([])).toThrowError(/The input JSON is empty/);
  });

  it('emits measurements with progress for each page batch', async () => {
    const list = jasmine.createSpy('list')
      .and.returnValues(
        Promise.resolve({ paging: { totalPages: 4001 } }),
        Promise.resolve({ data: [{ id: 'm1' }] }),
        Promise.resolve({ data: [{ id: 'm2' }] }),
        Promise.resolve({ data: [{ id: 'm3' }] })
      );
    const service = new MeasurementDownloadService({ list } as unknown as MeasurementService);

    const emissions = await firstValueFrom(
      service.getMeasurementsWithProgress('device-1').pipe(toArray())
    );

    expect(emissions.map((e) => e.progress)).toEqual([33, 67, 100]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    expect(emissions.flatMap((e) => e.measurements.map((m) => (m as any).id))).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('downloads CSV text as a file', () => {
    const service = new MeasurementDownloadService({} as MeasurementService);

    expect(() => {
      service.download('x,y\n1,2');
    }).not.toThrow();
  });
});
