import { Axios, AxiosRequestConfig, AxiosResponse } from 'axios';
import { RequestConfig } from '../types';

/**
 * Base class for HTTP clients.
 * This class should be extended by specific OAuth2/Token HTTP clients.
 */
export abstract class HttpClient {
  protected readonly fetchers = new Map<string, Axios>();

  /**
   * Sets the default configuration for the HTTP client.
   * This method should be implemented by subclasses to provide the default Axios request configuration.
   *
   * @param connection - The connection identifier for which to set the default configuration.
   * @return A promise that resolves to the Axios request configuration.
   */
  protected abstract defaultConfig(
    connection: string,
  ): Promise<AxiosRequestConfig> | AxiosRequestConfig;

  /**
   * Intercepts the request configuration to add authentication tokens or modify headers.
   * This method should be implemented by subclasses to handle token injection or other modifications.
   *
   * @param config - The Axios request configuration to intercept.
   * @return A promise that resolves to the modified Axios request configuration.
   */
  protected abstract intercept(
    config: AxiosRequestConfig,
  ): Promise<AxiosRequestConfig> | AxiosRequestConfig;

  protected async getFetcher(connection: string): Promise<Axios> {
    let fetcher = this.fetchers.get(connection);

    if (fetcher) {
      return fetcher;
    }

    const config = await this.defaultConfig(connection);
    fetcher = new Axios(config);
    this.fetchers.set(connection, fetcher);

    return fetcher;
  }

  /**
   * Make a request using the configured fetcher for the specified connection.
   * This method handles the request configuration, including authentication tokens if required.
   * @param config - The request configuration, including the connection and any additional options.
   * @return A promise that resolves to the Axios response.
   **/
  async request<T = any, D = any>(
    config: RequestConfig<D>,
  ): Promise<AxiosResponse<T>> {
    const interceptedConfig = await this.intercept(config);

    return this.getFetcher(config.connection).then((fetcher) =>
      fetcher.request<T>(interceptedConfig),
    );
  }

  /**
   * Sends a GET request to the specified URL with the provided configuration.
   *
   * @param url - The URL to send the GET request to. It can be a string or a URL object.
   * @param config - The request configuration, including headers, params, and other options.
   * @return A promise that resolves to the Axios response containing the data.
   */
  get<T = any>(url: URL | string, config: RequestConfig) {
    return this.request<T>({
      ...config,
      method: 'GET',
      url: url.toString(),
    });
  }

  /**
   * Sends a POST request to the specified URL with the provided data and configuration.
   *
   * @param url - The URL to send the POST request to. It can be a string or a URL object.
   * @param data - The data to send in the body of the POST request.
   * @param config - The request configuration, including headers, params, and other options.
   * @return A promise that resolves to the Axios response containing the data.
   */
  post<T = any, D = any>(url: URL | string, data: D, config: RequestConfig) {
    return this.request<T, D>({
      ...config,
      method: 'POST',
      url: url.toString(),
      data,
    });
  }

  /**
   * Sends a PUT request to the specified URL with the provided data and configuration.
   *
   * @param url - The URL to send the PUT request to. It can be a string or a URL object.
   * @param data - The data to send in the body of the PUT request.
   * @param config - The request configuration, including headers, params, and other options.
   * @return A promise that resolves to the Axios response containing the data.
   */
  put<T = any, D = any>(url: URL | string, data: D, config: RequestConfig) {
    return this.request<T, D>({
      ...config,
      method: 'PUT',
      url: url.toString(),
      data,
    });
  }

  /**
   * Sends a PATCH request to the specified URL with the provided data and configuration.
   *
   * @param url - The URL to send the PATCH request to. It can be a string or a URL object.
   * @param data - The data to send in the body of the PATCH request.
   * @param config - The request configuration, including headers, params, and other options.
   * @return A promise that resolves to the Axios response containing the data.
   */
  patch<T = any, D = any>(url: URL | string, data: D, config: RequestConfig) {
    return this.request<T, D>({
      ...config,
      method: 'PATCH',
      url: url.toString(),
      data,
    });
  }

  /**
   * Sends a DELETE request to the specified URL with the provided configuration.
   *
   * @param url - The URL to send the DELETE request to. It can be a string or a URL object.
   * @param config - The request configuration, including headers, params, and other options.
   * @return A promise that resolves to the Axios response containing the data.
   */
  delete<T = any>(url: URL | string, config: RequestConfig) {
    return this.request<T>({
      ...config,
      method: 'DELETE',
      url: url.toString(),
    });
  }

  /**
   * Sends a HEAD request to the specified URL with the provided configuration.
   *
   * @param url - The URL to send the HEAD request to. It can be a string or a URL object.
   * @param config - The request configuration, including headers, params, and other options.
   * @return A promise that resolves to the Axios response containing the data.
   */
  head<T = any>(url: URL | string, config: RequestConfig) {
    return this.request<T>({
      ...config,
      method: 'HEAD',
      url: url.toString(),
    });
  }

  /**
   * Sends an OPTIONS request to the specified URL with the provided configuration.
   *
   * @param url - The URL to send the OPTIONS request to. It can be a string or a URL object.
   * @param config - The request configuration, including headers, params, and other options.
   * @return A promise that resolves to the Axios response containing the data.
   */
  options<T = any>(url: URL | string, config: RequestConfig) {
    return this.request<T>({
      ...config,
      method: 'OPTIONS',
      url: url.toString(),
    });
  }
}
