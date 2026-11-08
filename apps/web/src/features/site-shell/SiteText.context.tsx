'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { SignInText, SiteHeader, SiteText } from './SiteShell.graphql';

/** Shown when the shell text cannot load (error and not-found pages outside the layout, `global-error`). */
export const LAST_RESORT_TEXT = {
  appName: 'Abyss',
  navCvLink: 'CV',
  signIn: 'Sign in',
  signOut: 'Sign out',
  errorTitle: 'Something went wrong',
  errorDescription:
    'This page could not be loaded. Nothing was changed. Try again, or come back in a few minutes.',
  errorRetry: 'Try again',
  notFoundTitle: 'Page not found',
  notFoundDescription: 'There is nothing at this address. Check the link and try again.',
  statusChecking: 'Checking',
  statusOperational: 'Operational',
  statusUnreachable: 'Unreachable',
  statusCheckAgain: 'Check again',
} as const;

interface SiteTextValue {
  header: SiteHeader;
  siteText: SiteText;
  signInText: SignInText;
}

const SiteTextContext = createContext<SiteTextValue | null>(null);

interface SiteTextProviderProps extends SiteTextValue {
  children: ReactNode;
}

/** Holds only text and the public header, so what the layout serialises to the browser carries no account data. */
export function SiteTextProvider({
  header,
  siteText,
  signInText,
  children,
}: SiteTextProviderProps) {
  const value = useMemo(() => ({ header, siteText, signInText }), [header, siteText, signInText]);
  return <SiteTextContext.Provider value={value}>{children}</SiteTextContext.Provider>;
}

/** The shared site text, or `null` outside the provider (use `LAST_RESORT_TEXT` then). */
export function useSiteText(): SiteText | null {
  return useContext(SiteTextContext)?.siteText ?? null;
}

/** The sign-in dialog text, or `null` outside the provider. */
export function useSignInText(): SignInText | null {
  return useContext(SiteTextContext)?.signInText ?? null;
}

/** The site header (brand, account button labels), or `null` outside the provider. */
export function useSiteHeader(): SiteHeader | null {
  return useContext(SiteTextContext)?.header ?? null;
}

function requireValue<T>(value: T | null): T {
  if (value === null) throw new Error('SiteTextProvider is missing above this component');
  return value;
}

/** For components that only render inside the layout (the account menu, the sign-in dialog). */
export function useRequiredSiteText(): SiteText {
  return requireValue(useSiteText());
}

/** Like `useRequiredSiteText`, for the sign-in text. */
export function useRequiredSignInText(): SignInText {
  return requireValue(useSignInText());
}
