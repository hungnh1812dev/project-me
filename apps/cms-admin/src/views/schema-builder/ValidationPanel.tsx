import { Button, Card, FormAlert } from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import type {
  DefinitionCheckStatus,
  DefinitionError,
  DefinitionValidation,
} from '@features/content-types';

import { fieldIdOfErrorPath, formatErrorPath } from './SchemaJson.rules';
import type { SchemaTree } from './SchemaTree.reducer';

interface ValidationPanelProps {
  tree: SchemaTree;
  status: DefinitionCheckStatus;
  /** The last answer; it stays while a newer check runs. */
  validation: DefinitionValidation | null;
  onRetry: () => void;
  /** Called with the id of the field an error points into. */
  onSelectField: (fieldId: string) => void;
}

function ErrorItem({
  error,
  tree,
  onSelectField,
}: {
  error: DefinitionError;
  tree: SchemaTree;
  onSelectField: (fieldId: string) => void;
}) {
  const copy = useScreenText('schemaBuilder').schemaBuilder.validation;
  const { fieldId } = fieldIdOfErrorPath(tree, error.path);
  const path = formatErrorPath(error.path);
  const body = (
    <>
      <span className="font-medium">{error.message}</span>
      <span className="block text-xs text-muted-foreground">
        <code>{error.rule}</code> · <code>{path === '' ? copy.typeLevel : path}</code>
      </span>
    </>
  );
  return (
    <li>
      {fieldId === null ? (
        <div className="px-3 py-2 text-sm">{body}</div>
      ) : (
        <button
          type="button"
          aria-label={copy.selectError(error.rule, path)}
          onClick={() => onSelectField(fieldId)}
          className="w-full cursor-pointer rounded-control px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          {body}
        </button>
      )}
    </li>
  );
}

/** The cms-api validator's answer for the current tree (SB-9, SB-11). */
export function ValidationPanel({
  tree,
  status,
  validation,
  onRetry,
  onSelectField,
}: ValidationPanelProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder.validation;
  const isChecking = status === 'checking';
  return (
    <Card className="grid gap-3" aria-busy={isChecking}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base font-semibold">{copy.heading}</h2>
        {isChecking && validation !== null ? (
          <output className="text-sm text-muted-foreground">{copy.checking}</output>
        ) : null}
      </div>
      {status === 'unavailable' ? (
        <div className="grid justify-items-start gap-3">
          <FormAlert tone="warning">
            <strong>{copy.unavailable}</strong> {copy.unavailableHint}
          </FormAlert>
          <Button type="button" onClick={onRetry}>
            {copy.retry}
          </Button>
        </div>
      ) : validation === null ? (
        <output className="m-0 block text-sm text-muted-foreground">{copy.waiting}</output>
      ) : (
        <div className={isChecking ? 'grid gap-2 opacity-60' : 'grid gap-2'}>
          <p className="m-0 text-sm font-medium tabular-nums">
            {validation.errors.length === 0
              ? copy.valid
              : copy.errorCount(validation.errors.length)}
          </p>
          {validation.errors.length === 0 ? null : (
            <ul aria-label={copy.listLabel} className="m-0 grid list-none gap-1 p-0">
              {validation.errors.map((error, index) => (
                <ErrorItem
                  key={`${index}:${error.rule}:${formatErrorPath(error.path)}`}
                  error={error}
                  tree={tree}
                  onSelectField={onSelectField}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
