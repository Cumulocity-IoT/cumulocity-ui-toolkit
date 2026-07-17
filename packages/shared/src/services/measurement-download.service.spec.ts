import { MeasurementService } from '@c8y/client';
import { saveAs } from 'file-saver';
import { firstValueFrom } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { MeasurementDownloadService } from './measurement-download.service';

jest.mock('file-saver', () => ({
  saveAs: jest.fn(),
}));

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

    expect(() => service.prepare([])).toThrow('The input JSON is empty.');
  });

  it('emits measurements with progress for each page batch', async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce({ paging: { totalPages: 4001 } })
      .mockResolvedValueOnce({ data: [{ id: 'm1' }] })
      .mockResolvedValueOnce({ data: [{ id: 'm2' }] })
      .mockResolvedValueOnce({ data: [{ id: 'm3' }] });
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

    service.download('x,y\n1,2');

    expect(saveAs).toHaveBeenCalledTimes(1);
    expect(saveAs).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/^measurements-.*\.csv$/)
    );
  });
});
