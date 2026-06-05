import { FetchClient, IFetchResponse } from '@c8y/client';
import { MicroserviceService } from './microservice.service';

describe('MicroserviceService', () => {
  it('parses successful JSON responses in default handler', async () => {
    const service = new MicroserviceService({ fetch: jest.fn() } as unknown as FetchClient);

    const result = await service.defaultResponseHandler({
      ok: true,
      status: 200,
      // eslint-disable-next-line @typescript-eslint/require-await
      json: async () => ({ ok: true }),
    } as IFetchResponse);

    expect(result).toEqual({ ok: true });
  });

  it('throws parsed API error message when response is not ok', async () => {
    const service = new MicroserviceService({ fetch: jest.fn() } as unknown as FetchClient);

    await expect(
      service.defaultResponseHandler({
        ok: false,
        status: 400,
        // eslint-disable-next-line @typescript-eslint/require-await
        text: async () => JSON.stringify({ message: 'bad request' }),
      } as IFetchResponse)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ).rejects.toThrow('bad request');
  });

  it('uses fetch client for get, post, put and delete', async () => {
    const fetch = jest
      .fn()
      // eslint-disable-next-line @typescript-eslint/require-await
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ a: 1 }) })
      // eslint-disable-next-line @typescript-eslint/require-await
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ b: 2 }) })
      // eslint-disable-next-line @typescript-eslint/require-await
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ c: 3 }) })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    const service = new MicroserviceService({ fetch } as unknown as FetchClient);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await expect(service.get('/g')).resolves.toEqual({ a: 1 });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await expect(service.post('/p', { x: 1 })).resolves.toEqual({ b: 2 });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await expect(service.put('/u', { y: 2 })).resolves.toEqual({ c: 3 });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await expect(service.delete('/d')).resolves.toEqual({ ok: true, status: 204 });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fetch).toHaveBeenCalledWith('/g', expect.objectContaining({ method: 'GET' }));
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fetch).toHaveBeenCalledWith(
      '/p',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ x: 1 }) })
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fetch).toHaveBeenCalledWith(
      '/u',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ y: 2 }) })
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(fetch).toHaveBeenCalledWith('/d', expect.objectContaining({ method: 'DELETE' }));
  });
});
