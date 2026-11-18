import { isSafeLinkTarget } from '@/utils/SafeLinkTarget.rules';

import { ExternalLink, MaskedPlaceholder, useMaskedText } from './CvSection';
import { isMaskedField, type Profile } from './PageCv.graphql';

const MAX_INITIALS = 2;
const EMAIL_SHAPE = /^[^\s<>"'@]+@[^\s<>"'@]+$/;
const NOT_DIALABLE = /[^\d+]/g;

type ContactField = 'email' | 'phone' | 'address' | 'linkedin' | 'github';

/** What a contact value turns into: a link target, or null for plain text. */
const LINK_TARGET_OF: Record<ContactField, (value: string) => string | null> = {
  email: (value) => (EMAIL_SHAPE.test(value) ? `mailto:${value}` : null),
  phone: (value) => {
    const dialable = value.replace(NOT_DIALABLE, '');
    return dialable === '' ? null : `tel:${dialable}`;
  },
  address: () => null,
  linkedin: (value) => (isSafeLinkTarget(value) ? value : null),
  github: (value) => (isSafeLinkTarget(value) ? value : null),
};

interface ContactRow {
  field: ContactField;
  isMasked: boolean;
  value: string;
}

/** Reading order of the card. */
const CONTACT_FIELDS: readonly ContactField[] = ['email', 'phone', 'address', 'linkedin', 'github'];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_INITIALS)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

function Avatar({ profile, name }: { profile: Profile; name: string }) {
  const url = profile.avatar?.url;
  if (url && isSafeLinkTarget(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Cloudinary origin is allowed by the CSP; next/image would need a loader
      <img
        src={url}
        alt={profile.avatar?.alt ?? ''}
        className="border-border size-16 shrink-0 rounded-full border object-cover"
      />
    );
  }
  if (name === '') return null;
  return (
    <span
      aria-hidden="true"
      className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-full text-lg font-semibold"
    >
      {initialsOf(name)}
    </span>
  );
}

function ContactValue({ field, value }: { field: ContactField; value: string }) {
  const target = LINK_TARGET_OF[field](value);
  if (target === null) return <>{value}</>;
  return field === 'email' || field === 'phone' ? (
    <a href={target} className="text-primary underline-offset-4 hover:underline">
      {value}
    </a>
  ) : (
    <ExternalLink href={target}>{value}</ExternalLink>
  );
}

/**
 * Contact details of the CV owner; a masked value shows the placeholder, or is
 * left out when there is no masked text. The CV labels have no field for the
 * contact labels, so the values stand without them.
 */
export function ContactCard({ profile }: { profile: Profile | null }) {
  const maskedText = useMaskedText();
  if (profile === null) return null;

  const rows = CONTACT_FIELDS.flatMap((field): ContactRow[] => {
    const isMasked = isMaskedField(profile, field);
    const value = profile[field];
    if (isMasked) return maskedText === null ? [] : [{ field, isMasked, value: '' }];
    return value?.trim() ? [{ field, isMasked, value }] : [];
  });
  if (rows.length === 0) return null;

  const name = profile.name?.trim() ?? '';
  return (
    <div className="border-border bg-card text-card-foreground mt-6 flex flex-col gap-4 rounded-md border p-5 sm:flex-row sm:items-start">
      <Avatar profile={profile} name={name} />
      <div className="min-w-0">
        {name === '' ? null : <p className="text-sm font-medium">{name}</p>}
        <ul className="mt-1 space-y-1 text-sm">
          {rows.map(({ field, isMasked, value }) => (
            <li key={field} className="min-w-0 wrap-break-word">
              {isMasked ? <MaskedPlaceholder /> : <ContactValue field={field} value={value} />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
