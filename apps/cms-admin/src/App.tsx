import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';

import AppProvider from './app/AppProvider';
import { createAppRouter } from './app/router';

/** The store, the React Query client, the session bootstrap and the router. */
const App: React.FC = () => {
  const [router] = useState(createAppRouter);

  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
};
App.displayName = 'App';

export default App;
