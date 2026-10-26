import type { FormAlertTone } from '@abyss/form-commons';

import type { BulkAction } from './Content.constants';

/** What the list page says after a bulk action or an import. */
export type Banner =
  | { kind: 'imported'; count: number }
  | { kind: 'error'; message: string }
  | {
      kind: 'result';
      action: BulkAction;
      total: number;
      done: number;
      failures: { name: string; reason: string }[];
    };

export function bannerTone(banner: Banner): FormAlertTone {
  if (banner.kind === 'imported') return 'success';
  if (banner.kind === 'error') return 'error';
  if (banner.failures.length === 0) return 'success';
  return banner.done === 0 ? 'error' : 'warning';
}
