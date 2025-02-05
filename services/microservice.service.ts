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

  defaultResponseHandler = async (response: IFetchResponse) => {
    if (!response.ok) {
      try {
        const errorMessage = await response.text();
        const parsed = JSON.parse(errorMessage);
        throw new Error(parsed.message);
      } catch (e) {
        return Promise.reject(response);
      }
    }

    if (response.status !== 204) {
      return response.json();
    }
  };

  constructor(private fetch: FetchClient) {}

  async get(
    url: string,
    responseHandler: (response: IFetchResponse) => Promise<any> = this.defaultResponseHandler
  ) {
    const response = await this.fetch.fetch(url, this.GET_OPTIONS);
    return responseHandler(response);
  }

  async post(
    url: string,
    data: any,
    responseHandler: (response: IFetchResponse) => Promise<any> = this.defaultResponseHandler
  ) {
    const options = cloneDeep(this.POST_OPTIONS);
    options.body = JSON.stringify(data);

    const response = await this.fetch.fetch(url, options);
    return responseHandler(response);
  }

  async put(
    url: string,
    data: any,
    responseHandler: (response: IFetchResponse) => Promise<any> = this.defaultResponseHandler
  ) {
    const options = cloneDeep(this.PUT_OPTIONS);
    options.body = JSON.stringify(data);

    const response = await this.fetch.fetch(url, options);
    return responseHandler(response);
  }

  async delete(url: string) {
    const response = await this.fetch.fetch(url, this.DELETE_OPTIONS);
    if (!response.ok) {
      return Promise.reject(response);
    }
    return response;
  }
}
