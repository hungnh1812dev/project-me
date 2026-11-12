import { useState } from 'react';
import { Button, Card, FormAlert, useToast } from '@abyss/form-commons';
import { useScreenText } from '@configs/locales';
import type { DefinitionCheckStatus, DefinitionValidation } from '@features/content-types';

import { serializeSchemaTree } from './SchemaJson.rules';
import type { SchemaTree } from './SchemaTree.reducer';

const JSON_MIME_TYPE = 'application/json';
const COPY_TOAST_KEY = 'schema-builder-copy';

interface ExportPanelProps {
  tree: SchemaTree;
  status: DefinitionCheckStatus;
  validation: DefinitionValidation | null;
  isResultCurrent: boolean;
  /** Called after a copy or download so the page can clear its unsaved flag. */
  onExported: () => void;
}

function downloadAsFile(fileName: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: JSON_MIME_TYPE }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Copy and download of the schema JSON, enabled only for a current, error-free check (SB-12, SB-14). */
export function ExportPanel({
  tree,
  status,
  validation,
  isResultCurrent,
  onExported,
}: ExportPanelProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder.export;
  const { showToast } = useToast();
  const [hasExported, setHasExported] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const canExport = isResultCurrent && validation?.valid === true;
  const reason = canExport
    ? null
    : status === 'unavailable'
      ? copy.reason.unavailable
      : status === 'checking' || !isResultCurrent
        ? copy.reason.checking
        : copy.reason.invalid;
  const markExported = () => {
    setHasExported(true);
    onExported();
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(serializeSchemaTree(tree).json);
    } catch {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    showToast({ tone: 'success', title: copy.copied, key: COPY_TOAST_KEY });
    markExported();
  };
  const download = () => {
    downloadAsFile(`${tree.slug}.json`, serializeSchemaTree(tree).json);
    setCopyFailed(false);
    markExported();
  };

  return (
    <Card className="grid gap-3">
      <h2 className="m-0 text-base font-semibold">{copy.heading}</h2>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!canExport} onClick={() => void copyJson()}>
          {copy.copy}
        </Button>
        <Button type="button" variant="primary" disabled={!canExport} onClick={download}>
          {copy.download}
        </Button>
      </div>
      {reason === null ? null : <p className="m-0 text-sm text-muted-foreground">{reason}</p>}
      {copyFailed ? <FormAlert tone="warning">{copy.copyFailed}</FormAlert> : null}
      {hasExported && !tree.changedSinceSnapshot ? (
        <div className="grid gap-2 border-t border-border pt-3">
          <h3 className="m-0 text-sm font-semibold">{copy.nextSteps.heading}</h3>
          <ol className="m-0 grid gap-1 pl-5 text-sm text-muted-foreground">
            {copy.nextSteps.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </Card>
  );
}
