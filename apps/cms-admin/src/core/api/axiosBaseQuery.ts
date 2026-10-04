import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import type { AxiosRequestConfig, Method } from 'axios';

import { toApiError } from './apiError';
import { cmsApi } from './CmsApi';

export interface AxiosQueryArgs {
  url: string;
  method?: Method;
  data?: unknown;
  params?: AxiosRequestConfig['params'];
  /** See `AxiosRequestConfig.skipAuthRefresh`: a 401 on this request never triggers a refresh. */
  skipAuthRefresh?: boolean;
}

/**
 * The `ApiError` fields as a plain object. RTK Query keeps errors in the store, which must stay
 * serializable, so the `ApiError` class instance is not stored as is.
 */
export interface ApiErrorData {
  status: number;
  message: string;
  messages: string[];
  code?: string;
  body?: unknown;
}

/** A plain `ApiErrorData`, such as the value an RTK Query `unwrap()` rejects with. */
function isApiErrorData(value: unknown): value is ApiErrorData {
  if (typeof value !== 'object' || value === null || value instanceof Error) return false;
  const { status, message, messages } = value as Partial<ApiErrorData>;
  return typeof status === 'number' && typeof message === 'string' && Array.isArray(messages);
}

export function toApiErrorData(error: unknown): ApiErrorData {
  if (isApiErrorData(error)) return error;
  const { status, message, messages, code, body } = toApiError(error);
  return { status, message, messages, code, body };
}

/** RTK Query base query over `cmsApi`, so RTK Query shares its bearer and 401 refresh. */
export function axiosBaseQuery(): BaseQueryFn<AxiosQueryArgs, unknown, ApiErrorData> {
  return async ({ url, method = 'GET', data, params, skipAuthRefresh }, { signal }) => {
    try {
      const response = await cmsApi.request({ url, method, data, params, skipAuthRefresh, signal });
      return { data: response.data };
    } catch (error) {
      return { error: toApiErrorData(error) };
    }
  };
}
