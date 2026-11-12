import { useMemo, useReducer, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Field,
  FormAlert,
  Input,
  Label,
  NativeSelect,
} from '@abyss/form-commons';
import { ConfirmDialog } from '@components/ConfirmDialog';
import { useLeaveGuard } from '@components/layouts/LeaveGuard';
import { PageHeader } from '@components/PageStates';
import { useRestoreFocus } from '@components/useRestoreFocus';
import { useScreenText } from '@configs/locales';
import { useCallerAccess } from '@features/access';
import { useDefinitionValidation, type DefinitionValidationMode } from '@features/content-types';

import { ExportPanel } from './ExportPanel';
import { ImportSchemaDialog } from './ImportSchemaDialog';
import { fieldIdOfErrorPath, serializeSchemaTree } from './SchemaJson.rules';
import { createNewSchemaTree, schemaTreeReducer, type ImportedTree } from './SchemaTree.reducer';
import { ValidationPanel } from './ValidationPanel';

type StartKind = 'new' | 'import';

const KIND_VALUES = ['collection', 'single'] as const;
const DEFAULT_KIND = 'collection';

/** `/schema-builder` (owner): build a content type definition and export its JSON (SB-1 to SB-14). */
export function SchemaBuilderPage() {
  const copy = useScreenText('schemaBuilder').schemaBuilder;
  const caller = useCallerAccess();
  const [tree, dispatch] = useReducer(schemaTreeReducer, undefined, createNewSchemaTree);
  const [isStarted, setIsStarted] = useState(false);
  const [mode, setMode] = useState<DefinitionValidationMode>('create');
  const [workId, setWorkId] = useState(0);
  const [pendingStart, setPendingStart] = useState<StartKind | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const { rememberOpener, restoreFocus } = useRestoreFocus();

  const hasUnsavedWork = isStarted && tree.changedSinceSnapshot;
  useLeaveGuard(hasUnsavedWork);

  const definition = useMemo(
    () => (caller.isOwner && isStarted ? serializeSchemaTree(tree).definition : null),
    [caller.isOwner, isStarted, tree],
  );
  const check = useDefinitionValidation(definition, mode);

  const startNew = () => {
    dispatch({ type: 'startNew' });
    setMode('create');
    setIsStarted(true);
    setSelectedFieldId(null);
    setWorkId((id) => id + 1);
  };
  const loadImport = (imported: ImportedTree) => {
    dispatch({ type: 'load', tree: imported });
    setMode('update');
    setIsStarted(true);
    setIsImportOpen(false);
    setSelectedFieldId(null);
    setWorkId((id) => id + 1);
  };
  const begin = (kind: StartKind) => {
    rememberOpener(document.activeElement);
    if (hasUnsavedWork) {
      setPendingStart(kind);
      return;
    }
    if (kind === 'new') startNew();
    else setIsImportOpen(true);
  };
  const confirmRestart = () => {
    const kind = pendingStart;
    setPendingStart(null);
    if (kind === 'new') startNew();
    if (kind === 'import') setIsImportOpen(true);
  };

  const keyErrors = (key: string) =>
    !check.isResultCurrent
      ? undefined
      : check.validation?.errors
          .filter((error) => {
            const target = fieldIdOfErrorPath(tree, error.path);
            return target.fieldId === null && target.key === key;
          })
          .map((error) => error.message)
          .join(' ') || undefined;

  const kind = tree.kind ?? DEFAULT_KIND;
  const kindValues = (KIND_VALUES as readonly string[]).includes(kind)
    ? KIND_VALUES
    : [...KIND_VALUES, kind];
  const startActions = (
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={() => begin('import')}>
        {copy.start.importJson}
      </Button>
      <Button
        type="button"
        variant={isStarted ? 'secondary' : 'primary'}
        onClick={() => begin('new')}
      >
        {copy.start.newType}
      </Button>
    </div>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        action={caller.isOwner && isStarted ? startActions : undefined}
      />
      {!caller.isOwner ? (
        <Card>
          <FormAlert tone="info">{copy.forbidden}</FormAlert>
        </Card>
      ) : !isStarted ? (
        <Card className="grid justify-items-start gap-3">
          <div className="grid gap-1">
            <p className="m-0 text-sm font-medium">{copy.start.title}</p>
            <p className="m-0 max-w-prose text-sm text-muted-foreground">{copy.start.hint}</p>
          </div>
          {startActions}
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div className="grid gap-6">
            <Card className="grid gap-4">
              <h2 className="m-0 text-base font-semibold">{copy.typeKeys.heading}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={copy.typeKeys.slug}
                  description={copy.typeKeys.slugHint}
                  error={keyErrors('slug')}
                >
                  {(control) => (
                    <Input
                      {...control}
                      value={tree.slug}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) =>
                        dispatch({ type: 'setTypeKey', key: 'slug', value: event.target.value })
                      }
                    />
                  )}
                </Field>
                <Field label={copy.typeKeys.displayName} error={keyErrors('displayName')}>
                  {(control) => (
                    <Input
                      {...control}
                      value={tree.displayName ?? ''}
                      onChange={(event) =>
                        dispatch({
                          type: 'setTypeKey',
                          key: 'displayName',
                          value: event.target.value,
                        })
                      }
                    />
                  )}
                </Field>
                <Field label={copy.typeKeys.kind} error={keyErrors('kind')}>
                  {(control) => (
                    <NativeSelect
                      {...control}
                      value={kind}
                      onChange={(event) =>
                        dispatch({ type: 'setTypeKey', key: 'kind', value: event.target.value })
                      }
                    >
                      {kindValues.map((value) => (
                        <option key={value} value={value}>
                          {value in copy.typeKeys.kindOptions
                            ? copy.typeKeys.kindOptions[
                                value as keyof typeof copy.typeKeys.kindOptions
                              ]
                            : value}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <div className="grid content-start gap-1.5">
                  <div className="flex items-center gap-2 sm:pt-7">
                    <Checkbox
                      id="schema-draft-and-publish"
                      checked={tree.draftAndPublish ?? true}
                      onCheckedChange={(checked) =>
                        dispatch({
                          type: 'setTypeKey',
                          key: 'draftAndPublish',
                          value: checked === true,
                        })
                      }
                    />
                    <Label htmlFor="schema-draft-and-publish">
                      {copy.typeKeys.draftAndPublish}
                    </Label>
                  </div>
                  <p className="m-0 text-sm text-muted-foreground">
                    {copy.typeKeys.draftAndPublishHint}
                  </p>
                  {keyErrors('draftAndPublish') === undefined ? null : (
                    <p className="m-0 text-sm text-destructive-strong">
                      {keyErrors('draftAndPublish')}
                    </p>
                  )}
                </div>
              </div>
            </Card>
            <Card className="grid gap-2" data-selected-field-id={selectedFieldId ?? undefined}>
              <h2 className="m-0 text-base font-semibold">{copy.fields.heading}</h2>
              <p className="m-0 text-sm text-muted-foreground tabular-nums">
                {copy.fields.count(tree.fields.length)}
              </p>
              <p className="m-0 text-sm text-muted-foreground">{copy.fields.placeholder}</p>
            </Card>
          </div>
          <div className="grid gap-6">
            <ValidationPanel
              tree={tree}
              status={check.status}
              validation={check.validation}
              onRetry={check.retry}
              onSelectField={setSelectedFieldId}
            />
            <ExportPanel
              key={workId}
              tree={tree}
              status={check.status}
              validation={check.validation}
              isResultCurrent={check.isResultCurrent}
              onExported={() => dispatch({ type: 'snapshotTaken' })}
            />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={pendingStart !== null}
        title={copy.restartDialog.title}
        description={copy.restartDialog.description}
        cancelLabel={copy.restartDialog.cancel}
        confirmLabel={copy.restartDialog.confirm}
        confirmVariant="destructive"
        onConfirm={confirmRestart}
        onCancel={() => setPendingStart(null)}
        onCloseFocus={() => restoreFocus(new Event('focus'))}
      />
      {isImportOpen ? (
        <ImportSchemaDialog
          onLoad={loadImport}
          onClose={() => setIsImportOpen(false)}
          onCloseAutoFocus={restoreFocus}
        />
      ) : null}
    </div>
  );
}
