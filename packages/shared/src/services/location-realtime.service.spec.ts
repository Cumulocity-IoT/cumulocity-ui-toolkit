import { EventService } from '@c8y/client';
import { RealtimeSubjectService } from '@c8y/ngx-components';
import { EMPTY, firstValueFrom, of } from 'rxjs';
import { take } from 'rxjs/operators';
import { LocationRealtimeService } from './location-realtime.service';

describe('LocationRealtimeService', () => {
  it('returns latest location event from historical API data', async () => {
    const event = {
      // eslint-disable-next-line @typescript-eslint/require-await
      list: jest.fn(async () => ({
        data: [
          {
            type: 'c8y_LocationUpdate',
            time: '2026-01-01T00:00:00.000Z',
            c8y_Position: { lat: 1, lng: 2, alt: 0, accuracy: 1 },
          },
        ],
      })),
    } as unknown as EventService;
    const service = new LocationRealtimeService({} as RealtimeSubjectService, event);

    jest.spyOn(service, 'onCreate$').mockReturnValue(EMPTY);

    const result = await firstValueFrom(service.fetchLatestAndRealtime$('device-1').pipe(take(1)));

    expect(result.type).toBe('c8y_LocationUpdate');
    expect(result.c8y_Position.lat).toBe(1);
  });

  it('startListening creates one stream per device id', () => {
    const service = new LocationRealtimeService(
      {} as RealtimeSubjectService,
      { list: jest.fn() } as unknown as EventService
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    jest.spyOn(service, 'fetchLatestAndRealtime$').mockReturnValue(of({} as any));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const map = service.startListening([{ id: 'd1' }, { id: 'd2' }] as any);

    expect(map.size).toBe(2);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(service.fetchLatestAndRealtime$).toHaveBeenCalledWith('d1');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(service.fetchLatestAndRealtime$).toHaveBeenCalledWith('d2');
  });
});
