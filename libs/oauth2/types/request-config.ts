import { AxiosRequestConfig } from 'axios';

export interface RequestConfig<D = any> extends AxiosRequestConfig<D> {
  connection: string;
  noAuth?: boolean; // If true, the request will not include authentication headers
}
