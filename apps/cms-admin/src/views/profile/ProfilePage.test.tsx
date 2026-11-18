import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { APP_ROUTES } from '@configs/App.routes';
import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen, within } from '@testing-library/react';

const copy = EN_TEXT.security.profile;

describe('ProfilePage', () => {
  it('shows name, email and role read-only', async () => {
    const { api, services } = createTestServices({
      [`POST ${API_ENDPOINTS.AUTH.REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
      [`GET ${API_ENDPOINTS.AUTH.ME}`]: () => ({ status: 200, data: TEST_USER }),
    });
    await services.session.restore();
    renderApp(services, APP_ROUTES.PROFILE);

    await screen.findByRole('heading', { level: 1, name: copy.title });
    const details = within(screen.getByRole('main'));
    expect(details.getByText(copy.name)).toBeInTheDocument();
    expect(details.getByText(TEST_USER.displayName)).toBeInTheDocument();
    expect(details.getByText(TEST_USER.email)).toBeInTheDocument();
    expect(details.getByText(TEST_USER.role)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    expect(api.callsTo(`GET ${API_ENDPOINTS.AUTH.ME}`)).toHaveLength(1);
  });
});
