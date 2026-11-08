import { render, screen } from '@testing-library/react';

import { SITE_SHELL_MOCK } from '@/apis/server/restful/mocks/SiteShell.mock';

import type { SignInText, SiteText } from './SiteShell.graphql';
import { SiteTextProvider, useSignInText, useSiteText } from './SiteText.context';

function Reader() {
  const siteText = useSiteText();
  const signInText = useSignInText();
  return (
    <p>
      {siteText?.navLabel ?? 'no site text'} / {signInText?.title ?? 'no sign-in text'}
    </p>
  );
}

describe('SiteTextProvider', () => {
  it('gives both text sets to its children', () => {
    render(
      <SiteTextProvider
        siteText={SITE_SHELL_MOCK.siteText as SiteText}
        signInText={SITE_SHELL_MOCK.signInText as SignInText}
      >
        <Reader />
      </SiteTextProvider>,
    );
    expect(screen.getByText('Main / Sign in')).toBeInTheDocument();
  });

  it('gives null outside the provider', () => {
    render(<Reader />);
    expect(screen.getByText('no site text / no sign-in text')).toBeInTheDocument();
  });
});
