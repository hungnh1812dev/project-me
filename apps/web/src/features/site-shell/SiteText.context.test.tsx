import { render, screen } from '@testing-library/react';

import { SITE_SHELL_MOCK } from '@/apis/server/restful/mocks/SiteShell.mock';

import type { SignInText, SiteText } from './SiteShell.graphql';
import {
  SiteTextProvider,
  useRequiredSignInText,
  useSignInText,
  useSiteText,
} from './SiteText.context';

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
        header={{ ...SITE_SHELL_MOCK.header, nav: [] }}
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

describe('required text hooks', () => {
  it('throw outside the provider, so a sign-in screen never renders without its text', () => {
    function NeedsText() {
      return <p>{useRequiredSignInText().title}</p>;
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<NeedsText />)).toThrow('SiteTextProvider is missing');
  });
});
