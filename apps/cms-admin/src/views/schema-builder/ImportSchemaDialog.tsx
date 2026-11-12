import { useState, type FormEvent } from 'react';
import { Button, FormAlert, Input, Label, Textarea } from '@abyss/form-commons';
import { Modal, ModalActions } from '@components/Modal';
import { useScreenText } from '@configs/locales';

import { parseSchemaJson } from './SchemaJson.rules';
import { MAX_IMPORT_FIELDS, type ImportedTree } from './SchemaTree.reducer';

interface ImportSchemaDialogProps {
  onLoad: (tree: ImportedTree) => void;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}

/** Pick a `.json` file or paste its text; a refused text keeps the current work (SB-3). */
export function ImportSchemaDialog({ onLoad, onClose, onCloseAutoFocus }: ImportSchemaDialogProps) {
  const copy = useScreenText('schemaBuilder').schemaBuilder.import;
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const readFile = async (file: File | undefined) => {
    if (file === undefined) return;
    try {
      setText(await file.text());
      setMessage(null);
    } catch {
      setMessage(copy.readFailed);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === '') {
      setMessage(copy.empty);
      return;
    }
    const result = parseSchemaJson(text);
    if (!result.ok) {
      setMessage(
        result.refusal === 'tooManyFields'
          ? copy.refusal.tooManyFields(MAX_IMPORT_FIELDS)
          : copy.refusal[result.refusal],
      );
      return;
    }
    onLoad(result.tree);
  };

  return (
    <Modal
      title={copy.title}
      description={copy.description}
      onClose={onClose}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="schema-import-file">{copy.fileLabel}</Label>
          <Input
            id="schema-import-file"
            type="file"
            accept={copy.fileAccept}
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="schema-import-text">{copy.textLabel}</Label>
          <Textarea
            id="schema-import-text"
            rows={8}
            spellCheck={false}
            className="font-mono"
            placeholder={copy.textPlaceholder}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setMessage(null);
            }}
          />
        </div>
        {message === null ? null : <FormAlert tone="error">{message}</FormAlert>}
        <ModalActions>
          <Button type="button" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="submit" variant="primary">
            {copy.submit}
          </Button>
        </ModalActions>
      </form>
    </Modal>
  );
}
