import { Button, FormAlert } from '@abyss/form-commons';

import { COPY } from '../../config/Copy.constants';
import { type Banner, bannerTone } from './bulk-banner';

const bulkCopy = COPY.content.bulk;

function bannerMessage(banner: Banner): string {
  switch (banner.kind) {
    case 'imported':
      return bulkCopy.importDialog.created(banner.count);
    case 'error':
      return banner.message;
    case 'result':
      return bulkCopy.summary[banner.action as 'publish'](
        banner.done,
        banner.total,
      );
  }
}

export function BulkBanner({
  banner,
  onDismiss,
}: {
  banner: Banner;
  onDismiss: () => void;
}) {
  return (
    <div className="grid gap-2">
      <FormAlert tone={bannerTone(banner)}>{bannerMessage(banner)}</FormAlert>
      {banner.kind === 'result' && banner.failures.length > 0 ? (
        <div className="grid gap-1 text-sm">
          <p className="m-0 font-medium">
            {bulkCopy.summary.failedHeading(banner.failures.length)}
          </p>
          <ul className="m-0 grid list-disc gap-0.5 pl-5">
            {banner.failures.map((failure, index) => (
              <li key={`${failure.name}-${index}`}>
                {bulkCopy.summary.failedItem(failure.name, failure.reason)}
              </li>
            ))}
          </ul>
          <p className="m-0 text-muted-foreground">
            {bulkCopy.summary.stillSelected}
          </p>
        </div>
      ) : null}
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          {bulkCopy.summary.dismiss}
        </Button>
      </div>
    </div>
  );
}
