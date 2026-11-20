const configureTurnstile = vi.fn<(options: { siteKey: string }) => void>();
const render = vi.fn<(element: unknown) => void>();

vi.mock('@abyss/form-commons/human-check', () => ({ configureTurnstile }));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render }) }));
vi.mock('@apis/client/Api.client', () => ({ apiClient: {} }));
vi.mock('@libs/QueryClient.setup', () => ({ createQueryClient: () => ({}) }));
vi.mock('./app/App', () => ({ App: () => null }));
vi.mock('./app/AppProviders', () => ({ AppProviders: () => null }));
vi.mock('./app/AppServices.setup', () => ({
  createAppServices: () => ({ session: { restore: vi.fn<() => Promise<void>>() } }),
}));

describe('main entry', () => {
  beforeEach(() => {
    vi.resetModules();
    configureTurnstile.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('configures Turnstile with the site key from the env before rendering', async () => {
    await import('./main');
    expect(configureTurnstile).toHaveBeenCalledExactlyOnceWith({
      siteKey: '1x00000000000000000000AA',
    });
    expect(render).toHaveBeenCalled();
  });
});
