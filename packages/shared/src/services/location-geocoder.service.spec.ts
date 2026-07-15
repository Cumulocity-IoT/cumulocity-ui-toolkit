import { FetchClient } from '@c8y/client';
import { LocationGeocoderService } from './location-geocoder.service';

describe('LocationGeocoderService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('returns parsed coordinates when the API has a result', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const fetchSpy: any = jest.spyOn(FetchClient.prototype, 'fetch').mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
      json: async () => [{ lat: '12.34', lon: '56.78' }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const service = new LocationGeocoderService();

    const result = await service.geoCode('Berlin');

    expect(fetchSpy).toHaveBeenCalledWith('search?city=Berlin&format=json', expect.any(Object));
    expect(result).toEqual({ lat: 12.34, lon: 56.78 });
  });

  it('returns undefined when no geocoding result is available', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    jest.spyOn(FetchClient.prototype, 'fetch').mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
      json: async () => [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const service = new LocationGeocoderService();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await expect(service.geoCode('Unknown')).resolves.toBeUndefined();
  });
});
