import { useRoutes } from 'react-router';

import { appRoutes } from './AppRoutes.setup';

export function App() {
  return useRoutes(appRoutes);
}
