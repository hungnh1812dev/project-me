import { createApi } from '@reduxjs/toolkit/query/react';

import type {
  EmailRequest,
  HasUsersResponse,
  LoginRequest,
  MessageResponse,
  MeUser,
  RegisterRequest,
  ResetPasswordRequest,
  TokenResponse,
  VerifyOtpRequest,
} from '@/features/auth/types';

import { axiosBaseQuery } from './axiosBaseQuery';

/**
 * RTK Query auth endpoints over `cmsApi`. None of them triggers a 401 refresh: the session thunks
 * (`features/auth/store/sessionThunks.ts`) call them right after getting a token and handle a 401
 * themselves. `refresh` is not an endpoint here: use the single-flight `refreshAccessToken()`.
 * The onboarding and recovery mutations are public, so they skip the refresh too.
 */
export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: axiosBaseQuery(),
  endpoints: (build) => ({
    hasUsers: build.query<HasUsersResponse, void>({
      query: () => ({ url: '/auth/has-users', skipAuthRefresh: true }),
      // Not cached past its last user: a "no users" answer is stale once the first account is
      // registered, and `/login` must not bounce back to `/register` on it.
      keepUnusedDataFor: 0,
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
    register: build.mutation<MessageResponse, RegisterRequest>({
      query: (body) => ({
        url: '/auth/register',
        method: 'POST',
        data: body,
        skipAuthRefresh: true,
      }),
    }),
    verifyOtp: build.mutation<MessageResponse, VerifyOtpRequest>({
      query: (body) => ({
        url: '/auth/verify-otp',
        method: 'POST',
        data: body,
        skipAuthRefresh: true,
      }),
    }),
    resendOtp: build.mutation<MessageResponse, EmailRequest>({
      query: (body) => ({
        url: '/auth/resend-otp',
        method: 'POST',
        data: body,
        skipAuthRefresh: true,
      }),
    }),
    forgotPassword: build.mutation<MessageResponse, EmailRequest>({
      query: (body) => ({
        url: '/auth/forgot-password',
        method: 'POST',
        data: body,
        skipAuthRefresh: true,
      }),
    }),
    resetPassword: build.mutation<MessageResponse, ResetPasswordRequest>({
      query: (body) => ({
        url: '/auth/reset-password',
        method: 'POST',
        data: body,
        skipAuthRefresh: true,
      }),
    }),
  }),
});

export const {
  useHasUsersQuery,
  useMeQuery,
  useLoginMutation,
  useLogoutMutation,
  useRegisterMutation,
  useVerifyOtpMutation,
  useResendOtpMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} = authApi;
