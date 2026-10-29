import { APP_ROUTES } from '../../config/App.routes';
import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { createBackupsApi } from './Backups.api';
import { useBackupsNavItems } from './Backups.queries';
import { BackupsApiProvider } from './BackupsApi.context';
import { BackupsPage } from './BackupsPage';

export const backupsFeature: Feature = {
  apiServices: [defineApiService(createBackupsApi, BackupsApiProvider)],
  useNavItems: useBackupsNavItems,
  routes: [{ path: APP_ROUTES.BACKUPS, Component: BackupsPage }],
};
