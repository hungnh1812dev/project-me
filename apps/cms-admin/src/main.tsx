import './styles/app.css';

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
