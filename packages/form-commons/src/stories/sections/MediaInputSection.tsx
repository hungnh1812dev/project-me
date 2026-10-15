import { useState } from 'react';

import { Field } from '../../components/native/Field';
import { MediaInput } from '../../components/native/MediaInput';
import type { MediaValue } from '../../lib/media';
import { DemoMediaProvider } from '../DemoMediaProvider';
import { DEMO_ASSETS, type DemoAsset } from '../mediaLibrary';
import { Section } from './Section';

const noop = () => {};

const DENIED = { allowed: false, reason: 'Requires the "media:read" permission.' };

/** A MediaInput in a Field, on local state. */
const MediaDemo: React.FC<{
  label: string;
  initial: MediaValue<DemoAsset>;
  readOnly?: boolean;
}> = ({ label, initial, readOnly }) => {
  const [value, setValue] = useState<MediaValue<DemoAsset>>(initial);
  return (
    <Field label={label}>
      <MediaInput<DemoAsset>
        value={value}
        onChange={setValue}
        readOnly={readOnly}
        config={{ label }}
      />
    </Field>
  );
};
MediaDemo.displayName = 'MediaDemo';

/**
 * The UI kit's MediaInput section, on the in-memory demo library: empty, chosen, an id the
 * library doesn't have ("File not found"), read-only, an id while the library loads, and Choose
 * denied.
 */
export const MediaInputSection: React.FC = () => (
  <Section title="MediaInput">
    <DemoMediaProvider>
      <MediaDemo label="Cover image" initial={null} />
      <MediaDemo label="Team photo" initial={DEMO_ASSETS[1]!} />
      <MediaDemo label="Old banner" initial="media-deleted" />
      <MediaDemo label="Read-only logo" initial={DEMO_ASSETS[2]!} readOnly />
    </DemoMediaProvider>
    <DemoMediaProvider items={undefined}>
      <MediaDemo label="Loading image" initial="media-cover" />
    </DemoMediaProvider>
    <DemoMediaProvider canBrowse={DENIED}>
      <Field label="Gated image">
        <MediaInput<DemoAsset>
          value={DEMO_ASSETS[0]!}
          onChange={noop}
          config={{ label: 'Gated image' }}
        />
      </Field>
    </DemoMediaProvider>
  </Section>
);
MediaInputSection.displayName = 'MediaInputSection';
