'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { SignInText, SiteText } from './SiteShell.graphql';

/** Shown when the shell text cannot load (error and not-found pages outside the layout, `global-error`). */
export const LAST_RESORT_TEXT = {
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
  siteText: SiteText;
  signInText: SignInText;
}

const SiteTextContext = createContext<SiteTextValue | null>(null);

interface SiteTextProviderProps extends SiteTextValue {
  children: ReactNode;
}

/** Holds only text, so what the layout serialises to the browser carries no account data. */
export function SiteTextProvider({ siteText, signInText, children }: SiteTextProviderProps) {
  const value = useMemo(() => ({ siteText, signInText }), [siteText, signInText]);
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
