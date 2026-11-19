import {
  CvSection,
  hasText,
  KEEP_TOGETHER_CLASS,
  MaskedPlaceholder,
  useMaskedText,
} from './CvSection';
import {
  isMaskedField,
  type CvCommonText,
  type PageCvA,
  type PageCvReference,
} from './PageCv.graphql';

function ReferencePhone({
  phone,
  isMasked,
  label,
}: {
  phone: string | null;
  isMasked: boolean;
  label: string | null | undefined;
}) {
  const maskedText = useMaskedText();
  if (isMasked ? maskedText === null : !hasText(phone)) return null;
  return (
    <p className="text-cv-text mt-0.5 text-sm">
      {hasText(label) ? <span className="font-semibold">{label}: </span> : null}
      {isMasked || !hasText(phone) ? (
        <MaskedPlaceholder />
      ) : (
        <span className="text-cv-ink font-semibold">{phone}</span>
      )}
    </p>
  );
}

function ReferenceItem({
  reference,
  isPhoneMasked,
  text,
}: {
  reference: PageCvReference;
  isPhoneMasked: boolean;
  text: CvCommonText | null;
}) {
  return (
    <li className={KEEP_TOGETHER_CLASS}>
      <h3 className="text-cv-text text-base font-semibold">{reference.name}</h3>
      {hasText(reference.role) ? <p className="text-cv-muted text-sm">{reference.role}</p> : null}
      <ReferencePhone phone={reference.phone} isMasked={isPhoneMasked} label={text?.phone} />
    </li>
  );
}

export function ReferencesSection({ cv, text }: { cv: PageCvA; text: CvCommonText | null }) {
  const references = (cv.references ?? []).filter((reference) => hasText(reference.name));
  if (references.length === 0) return null;
  const isPhoneMasked = isMaskedField(cv, 'references.phone');
  return (
    <CvSection title={text?.reference}>
      <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {references.map((reference, index) => (
          <ReferenceItem
            key={`${reference.name}-${index}`}
            reference={reference}
            isPhoneMasked={isPhoneMasked}
            text={text}
          />
        ))}
      </ul>
    </CvSection>
  );
}
