import { ModuleStatus } from '@/features/status/ModuleStatus';
import { loadModuleStatusText } from '@/features/status/ModuleStatus.server';

export default async function PageHome() {
  return <ModuleStatus text={await loadModuleStatusText()} />;
}
