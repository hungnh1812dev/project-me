import { createApi } from '@reduxjs/toolkit/query/react';

import type {
  HasUsersResponse,
  LoginRequest,
  MessageResponse,
  MeUser,
  TokenResponse,
} from '@/features/auth/types';

import { axiosBaseQuery } from './axiosBaseQuery';

/**
 * RTK Query auth endpoints over `cmsApi`. None of them triggers a 401 refresh: the session thunks
 * (`features/auth/store/sessionThunks.ts`) call them right after getting a token and handle a 401
 * themselves. `refresh` is not an endpoint here: use the single-flight `refreshAccessToken()`.
 */
export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: axiosBaseQuery(),
  endpoints: (build) => ({
    hasUsers: build.query<HasUsersResponse, void>({
      query: () => ({ url: '/auth/has-users', skipAuthRefresh: true }),
    }),
    login: build.mutation<TokenResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', data: body, skipAuthRefresh: true }),
    }),
    me: build.query<MeUser, void>({
      query: () => ({ url: '/auth/me', skipAuthRefresh: true }),
    }),
    logout: build.mutation<MessageResponse, void>({
      query: () => ({ url: '/auth/logout', method: 'POST', skipAuthRefresh: true }),
    }),
  }),
});

export const { useHasUsersQuery, useMeQuery, useLoginMutation, useLogoutMutation } = authApi;
