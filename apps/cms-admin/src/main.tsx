import './styles/app.css';

import { CSP_NONCE_META_NAME } from '@abyss/form-commons';
import { setNonce } from 'get-nonce';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './app/App';
import { AppProviders } from './app/AppProviders';
import { createAppServices } from './app/app-services';
import { createQueryClient } from './app/query-client';
import { apiClient } from './lib/api-client';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Missing #root element in index.html');
}

// nginx puts a per-request nonce in this meta tag and in the CSP. Radix's
// scroll lock injects a <style> and reads the nonce through get-nonce.
const nonce = document
  .querySelector(`meta[name="${CSP_NONCE_META_NAME}"]`)
  ?.getAttribute('content');
if (nonce) setNonce(nonce);

const services = createAppServices(apiClient, createQueryClient());
// Once per page load, outside React, so StrictMode can't start it twice.
void services.session.restore();

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders services={services}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppProviders>
  </StrictMode>,
);
