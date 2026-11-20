import type { ReactNode } from 'react';

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

const ICON_PATH_OF: Record<ContactField, ReactNode> = {
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  address: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  email: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </>
  ),
  github: (
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  ),
  linkedin: (
    <>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </>
  ),
};

interface ContactRow {
  field: ContactField;
  isMasked: boolean;
  value: string;
}

/** Reading order of the card: two columns, so phone sits beside address and email beside GitHub. */
const CONTACT_FIELDS: readonly ContactField[] = ['phone', 'address', 'email', 'github', 'linkedin'];

/** Long values that take a whole row of the grid so they never break mid-word. */
const FULL_ROW_FIELDS: ReadonlySet<ContactField> = new Set(['linkedin']);

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_INITIALS)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

const AVATAR_FRAME_CLASS = 'border-cv-panel-edge size-28 shrink-0 rounded-lg border-2 object-cover';

/** The profile photo, or the initials of the name when there is no safe photo. */
export function ProfileAvatar({ profile }: { profile: Profile | null }) {
  const url = profile?.avatar?.url;
  if (url && isSafeLinkTarget(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Cloudinary origin is allowed by the CSP; next/image would need a loader
      <img src={url} alt={profile?.avatar?.alt ?? ''} className={AVATAR_FRAME_CLASS} />
    );
  }
  const name = profile?.name?.trim() ?? '';
  if (name === '') return null;
  return (
    <span
      aria-hidden="true"
      className={`${AVATAR_FRAME_CLASS} bg-cv-chip text-cv-ink flex items-center justify-center text-3xl font-bold`}
    >
      {initialsOf(name)}
    </span>
  );
}

function ContactIcon({ field }: { field: ContactField }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-cv-muted size-4 shrink-0"
    >
      {ICON_PATH_OF[field]}
    </svg>
  );
}

function ContactValue({ field, value }: { field: ContactField; value: string }) {
  const target = LINK_TARGET_OF[field](value);
  if (target === null) return <>{value}</>;
  return field === 'email' || field === 'phone' ? (
    <a href={target} className="text-cv-ink underline-offset-4 hover:underline">
      {value}
    </a>
  ) : (
    <ExternalLink href={target}>{value}</ExternalLink>
  );
}

/**
 * Contact details of the CV owner, each with its icon; a masked value shows the placeholder, or
 * is left out when there is no masked text. The CV labels have no field for the contact labels,
 * so the icons stand in for them.
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

  return (
    <ul className="text-cv-text mt-4 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
      {rows.map(({ field, isMasked, value }) => (
        <li
          key={field}
          className={`flex min-w-0 items-center gap-2 wrap-break-word ${FULL_ROW_FIELDS.has(field) ? 'sm:col-span-2' : ''}`}
        >
          <ContactIcon field={field} />
          <span className="min-w-0">
            {isMasked ? <MaskedPlaceholder /> : <ContactValue field={field} value={value} />}
          </span>
        </li>
      ))}
    </ul>
  );
}
