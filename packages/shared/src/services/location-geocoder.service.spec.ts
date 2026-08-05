import { FetchClient } from '@c8y/client';
import { LocationGeocoderService } from './location-geocoder.service';

describe('LocationGeocoderService', () => {
  it('returns parsed coordinates when the API has a result', async () => {
    const fetchSpy: any = spyOn(FetchClient.prototype, 'fetch').and.returnValue(
      Promise.resolve({
        // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
        json: async () => [{ lat: '12.34', lon: '56.78' }],
      } as any)
    );
    const service = new LocationGeocoderService();

    const result = await service.geoCode('Berlin');

    expect(fetchSpy).toHaveBeenCalledWith('search?city=Berlin&format=json', jasmine.any(Object));
    expect(result).toEqual({ lat: 12.34, lon: 56.78 });
  });

  it('returns undefined when no geocoding result is available', async () => {
    spyOn(FetchClient.prototype, 'fetch').and.returnValue(
      Promise.resolve({
        // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
        json: async () => [],
      } as any)
    );
    const service = new LocationGeocoderService();

    expect(await service.geoCode('Unknown')).toEqual({ lat: undefined, lon: undefined });
  });
});
