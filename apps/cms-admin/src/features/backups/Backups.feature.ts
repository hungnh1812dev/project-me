import { APP_ROUTES } from '../../config/App.routes';
import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { BackupsApiProvider } from './BackupsApi.context';
import { createBackupsApi } from './Backups.api';
import { BackupsPage } from './BackupsPage';
import { useBackupsNavItems } from './Backups.queries';

export const backupsFeature: Feature = {
  apiServices: [defineApiService(createBackupsApi, BackupsApiProvider)],
  useNavItems: useBackupsNavItems,
  routes: [{ path: APP_ROUTES.BACKUPS, Component: BackupsPage }],
};
