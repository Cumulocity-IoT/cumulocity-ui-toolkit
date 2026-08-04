import { FetchClient, IFetchResponse } from '@c8y/client';
import { MicroserviceService } from './microservice.service';

describe('MicroserviceService', () => {
  it('parses successful JSON responses in default handler', async () => {
    const service = new MicroserviceService({ fetch: jasmine.createSpy('fetch') } as unknown as FetchClient);

    const result = await service.defaultResponseHandler({
      ok: true,
      status: 200,
      // eslint-disable-next-line @typescript-eslint/require-await
      json: async () => ({ ok: true }),
    } as IFetchResponse);

    expect(result).toEqual({ ok: true });
  });

  it('throws parsed API error message when response is not ok', async () => {
    const service = new MicroserviceService({ fetch: jasmine.createSpy('fetch') } as unknown as FetchClient);

    try {
      await service.defaultResponseHandler({
        ok: false,
        status: 400,
        // eslint-disable-next-line @typescript-eslint/require-await
        text: async () => JSON.stringify({ message: 'bad request' }),
      } as IFetchResponse);
      fail('Expected an error to be thrown');
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect((error as any).message).toContain('bad request');
    }
  });

  it('uses fetch client for get, post, put and delete', async () => {
    const fetch = jasmine.createSpy('fetch')
      .and.returnValues(
        // eslint-disable-next-line @typescript-eslint/require-await
        Promise.resolve({ ok: true, status: 200, json: async () => ({ a: 1 }) }),
        // eslint-disable-next-line @typescript-eslint/require-await
        Promise.resolve({ ok: true, status: 200, json: async () => ({ b: 2 }) }),
        // eslint-disable-next-line @typescript-eslint/require-await
        Promise.resolve({ ok: true, status: 200, json: async () => ({ c: 3 }) }),
        Promise.resolve({ ok: true, status: 204 })
      );
    const service = new MicroserviceService({ fetch } as unknown as FetchClient);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(await service.get('/g')).toEqual({ a: 1 });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(await service.post('/p', { x: 1 })).toEqual({ b: 2 });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(await service.put('/u', { y: 2 })).toEqual({ c: 3 });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(await service.delete('/d')).toEqual(jasmine.objectContaining({ ok: true, status: 204 }));

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fetch).toHaveBeenCalledWith('/g', jasmine.objectContaining({ method: 'GET' }));
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fetch).toHaveBeenCalledWith(
      '/p',
      jasmine.objectContaining({ method: 'POST', body: JSON.stringify({ x: 1 }) })
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fetch).toHaveBeenCalledWith(
      '/u',
      jasmine.objectContaining({ method: 'PUT', body: JSON.stringify({ y: 2 }) })
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fetch).toHaveBeenCalledWith('/d', jasmine.objectContaining({ method: 'DELETE' }));
  });
});
