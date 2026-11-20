import {
  TurnstileSlot,
  type HumanCheckForm,
  type TurnstileSlotText,
} from '@abyss/form-commons/human-check';

/**
 * The human check of a form: the challenge slot, and the "required" line while
 * a submit found no token yet. The form owns `useTurnstile` and the reset.
 */
export function HumanCheckField({
  formId,
  text,
  isTokenMissing,
}: {
  formId: HumanCheckForm;
  text: TurnstileSlotText & { required: string };
  isTokenMissing: boolean;
}) {
  return (
    <div className="grid gap-1">
      <TurnstileSlot formId={formId} text={text} />
      {isTokenMissing ? (
        <p role="alert" className="text-sm text-destructive-strong">
          {text.required}
        </p>
      ) : null}
    </div>
  );
}
