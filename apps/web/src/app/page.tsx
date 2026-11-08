import { loadStatusPage } from '../features/status/StatusPage.server';
import { StatusView } from '../views/status/StatusView';

export default async function HomePage() {
  return <StatusView text={await loadStatusPage()} />;
}
