import { TestBed } from '@angular/core/testing';
import { FetchClient } from '@c8y/client';
import { DtmService } from './dtm.service';

/** Creates a minimal FetchClient spy where `fetch` returns a JSON response. */
function mockFetch(body: unknown): jasmine.SpyObj<FetchClient> {
  const spy = jasmine.createSpyObj<FetchClient>('FetchClient', ['fetch']);

  spy.fetch.and.returnValue(
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response)
  );

  return spy;
}

describe('DtmService', () => {
  let service: DtmService;
  let fetchSpy: jasmine.SpyObj<FetchClient>;

  function setup(responseBody: unknown): void {
    fetchSpy = mockFetch(responseBody);

    TestBed.configureTestingModule({
      providers: [DtmService, { provide: FetchClient, useValue: fetchSpy }],
    });

    service = TestBed.inject(DtmService);
  }

  describe('getAssetTypes()', () => {
    it('maps definitions in a top-level array', async () => {
      setup([
        { identifier: 'Pump', jsonSchema: { title: 'Pump Device' } },
        { identifier: 'Sensor', jsonSchema: { title: 'Sensor' } },
      ]);

      const types = await service.getAssetTypes();

      expect(types.length).toBe(2);
      expect(types[0]).toEqual({ identifier: 'Pump', label: 'Pump Device', icon: undefined });
      expect(types[1]).toEqual({ identifier: 'Sensor', label: 'Sensor', icon: undefined });
    });

    it('maps definitions in a nested array property', async () => {
      setup({
        definitions: [{ identifier: 'Valve', jsonSchema: { title: 'Valve' } }],
      });

      const types = await service.getAssetTypes();

      expect(types.length).toBe(1);
      expect(types[0].identifier).toBe('Valve');
    });

    it('falls back to type/name when identifier is missing', async () => {
      setup([{ type: 'ByType', jsonSchema: { title: 'By Type' } }]);

      const types = await service.getAssetTypes();

      expect(types[0].identifier).toBe('ByType');
    });

    it('uses label/name as display label when jsonSchema.title is absent', async () => {
      setup([{ identifier: 'X', label: 'My Label' }]);

      const types = await service.getAssetTypes();

      expect(types[0].label).toBe('My Label');
    });

    it('falls back to identifier when no label source is present', async () => {
      setup([{ identifier: 'Raw' }]);

      const types = await service.getAssetTypes();

      expect(types[0].label).toBe('Raw');
    });

    it('extracts the icon from a top-level icon property', async () => {
      setup([
        {
          identifier: 'Motor',
          jsonSchema: { title: 'Motor' },
          icon: { name: 'settings' },
        },
      ]);

      const types = await service.getAssetTypes();

      expect(types[0].icon).toEqual({ name: 'settings' });
    });

    it('filters out definitions without a usable identifier', async () => {
      setup([{ jsonSchema: { title: 'No ID' } }]);

      const types = await service.getAssetTypes();

      expect(types.length).toBe(0);
    });

    it('returns empty array when response has no array', async () => {
      setup({ unrelated: 'data' });

      const types = await service.getAssetTypes();

      expect(types).toEqual([]);
    });
  });

  describe('getAssetTypeProperties()', () => {
    it('maps jsonSchema.properties to DtmAssetProperty[]', async () => {
      setup({
        identifier: 'Pump',
        jsonSchema: {
          properties: {
            serialNumber: { title: 'Serial Number' },
            pressure: { title: 'Pressure (bar)' },
          },
        },
      });

      const props = await service.getAssetTypeProperties('Pump');

      expect(props).toEqual([
        { name: 'serialNumber', label: 'Serial Number' },
        { name: 'pressure', label: 'Pressure (bar)' },
      ]);
    });

    it('uses property key as label when title is absent', async () => {
      setup({
        identifier: 'Pump',
        jsonSchema: {
          properties: { rawKey: {} },
        },
      });

      const props = await service.getAssetTypeProperties('Pump');

      expect(props[0]).toEqual({ name: 'rawKey', label: 'rawKey' });
    });

    it('encodes the identifier in the request URL', async () => {
      setup({ jsonSchema: { properties: {} } });
      await service.getAssetTypeProperties('Asset Type/With Slash');
      const url = (fetchSpy.fetch.calls.first().args[0] as string);
      expect(url).toContain(encodeURIComponent('Asset Type/With Slash'));
    });

    it('returns empty array when definition has no properties', async () => {
      setup({ identifier: 'Empty', jsonSchema: {} });
      expect(await service.getAssetTypeProperties('Empty')).toEqual([]);
    });

    it('returns empty array when response is undefined', async () => {
      setup(undefined);
      expect(await service.getAssetTypeProperties('Missing')).toEqual([]);
    });
  });
});
