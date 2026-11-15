import { isSafeLinkTarget } from '@/utils/SafeLinkTarget.rules';

import { ExternalLink, MaskedPlaceholder } from './CvSection';
import { isMaskedField, type PageCvText, type Profile } from './PageCv.graphql';

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

/** Contact details of the CV owner; a masked value shows the placeholder. */
export function ContactCard({
  profile,
  fallbackName,
  text,
}: {
  profile: Profile | null;
  /** Used for the initials when the profile has no name. */
  fallbackName: string;
  text: PageCvText['contact'];
}) {
  if (profile === null) return null;

  const rows = CONTACT_FIELDS.flatMap((field) => {
    const isMasked = isMaskedField(profile, field);
    const value = profile[field];
    if (!isMasked && !value?.trim()) return [];
    return [{ field, isMasked, value: value ?? '' }];
  });
  if (rows.length === 0) return null;

  const name = profile.name?.trim() || fallbackName;
  return (
    <section
      aria-labelledby="cv-profile-title"
      className="border-border bg-card text-card-foreground mt-6 flex flex-col gap-4 rounded-md border p-5 sm:flex-row sm:items-start"
    >
      <Avatar profile={profile} name={name} />
      <div className="min-w-0">
        <h2 id="cv-profile-title" className="text-base font-semibold">
          {text.title}
        </h2>
        {profile.name?.trim() ? <p className="mt-1 text-sm font-medium">{profile.name}</p> : null}
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(({ field, isMasked, value }) => (
            <div key={field} className="contents">
              <dt className="text-muted-foreground">{text[field]}</dt>
              <dd className="min-w-0 wrap-break-word">
                {isMasked ? <MaskedPlaceholder /> : <ContactValue field={field} value={value} />}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
