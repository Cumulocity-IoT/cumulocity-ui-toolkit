import { Injectable } from '@angular/core';
import { FetchClient, IFetchOptions, IFetchResponse } from '@c8y/client';
import { cloneDeep } from 'lodash';

@Injectable({
  providedIn: 'root',
})
export class MicroserviceService {
  GET_OPTIONS: IFetchOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  POST_OPTIONS: IFetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  PUT_OPTIONS: IFetchOptions = {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  DELETE_OPTIONS: IFetchOptions = {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  defaultResponseHandler = async (response: IFetchResponse): Promise<unknown> => {
    if (!response.ok) {
      const errorMessage = await response.text();
      let message = `Request failed with status ${response.status}`;

      try {
        const parsed = JSON.parse(errorMessage) as { message?: string };

        if (parsed.message) {
          message = parsed.message;
        }
      } catch {
        // ignore JSON parse errors, use the status message
      }

      throw new Error(message);
    }

    if (response.status !== 204) {
      const data: unknown = await response.json();

      return data;
    }
  };

  constructor(private fetch: FetchClient) {}

  async get(
    url: string,
    responseHandler: (response: IFetchResponse) => Promise<unknown> = this.defaultResponseHandler
  ): Promise<unknown> {
    const response = await this.fetch.fetch(url, this.GET_OPTIONS);
    return responseHandler(response);
  }

  async post(
    url: string,
    data: unknown,
    responseHandler: (response: IFetchResponse) => Promise<unknown> = this.defaultResponseHandler
  ): Promise<unknown> {
    const options = cloneDeep(this.POST_OPTIONS);

    options.body = JSON.stringify(data);

    const response = await this.fetch.fetch(url, options);
    return responseHandler(response);
  }

  async put(
    url: string,
    data: unknown,
    responseHandler: (response: IFetchResponse) => Promise<unknown> = this.defaultResponseHandler
  ): Promise<unknown> {
    const options = cloneDeep(this.PUT_OPTIONS);

    options.body = JSON.stringify(data);

    const response = await this.fetch.fetch(url, options);
    return responseHandler(response);
  }

  async delete(url: string): Promise<IFetchResponse> {
    const response = await this.fetch.fetch(url, this.DELETE_OPTIONS);

    if (!response.ok) {
      throw new Error(`DELETE request failed with status ${response.status}`);
    }

    return response;
  }
}
