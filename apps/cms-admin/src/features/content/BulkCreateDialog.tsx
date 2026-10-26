import {
  Button,
  CheckboxInput,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  JsonInput,
  FormAlert,
} from '@abyss/form-commons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';

import { BULK_ACTION, BULK_MAX_ITEMS } from './content.constants';
import { COPY } from '../../config/Copy.constants';
import { failedItems, itemReason, toBulkFailure } from './bulk';
import { useContentApi } from './content-api-context';
import type { DocumentTree } from './content.api';
import { CONTENT_QUERY_KEYS } from './content-queries';

const copy = COPY.content.bulk.importDialog;

interface FormValues {
  payload: string;
  atomic: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses the pasted text into bulk create items. Returns the items, or the
 * message for the first problem (shown under the field).
 */
export function parseImportText(
  text: string,
): { items: DocumentTree[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: copy.invalidJson };
  }
  if (!Array.isArray(parsed)) return { error: copy.notArray };
  if (parsed.length === 0) return { error: copy.empty };
  if (parsed.length > BULK_MAX_ITEMS) {
    return { error: copy.tooMany(BULK_MAX_ITEMS) };
  }
  const position = parsed.findIndex((item) => !isPlainObject(item));
  if (position !== -1) return { error: copy.badItem(position + 1) };
  return { items: parsed as DocumentTree[] };
}

interface ItemProblem {
  position: number;
  reason: string;
}

/** Bulk create: a JSON array of documents with per-item errors. */
export function BulkCreateDialog({
  slug,
  open,
  onClose,
  onImported,
  onCloseAutoFocus,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  /** Every item was created. */
  onImported: (count: number) => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const api = useContentApi();
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    defaultValues: { payload: '', atomic: false },
  });
  const [alert, setAlert] = useState<string | null>(null);
  const [problems, setProblems] = useState<ItemProblem[]>([]);
  const [partial, setPartial] = useState<string | null>(null);

  const reset = () => {
    form.reset({ payload: '', atomic: false });
    setAlert(null);
    setProblems([]);
    setPartial(null);
  };

  const run = useMutation({
    mutationFn: (input: { items: DocumentTree[]; atomic: boolean }) =>
      api.bulk(slug, BULK_ACTION.CREATE, input.items, input.atomic),
    onSuccess: (response, input) => {
      if (response.succeeded > 0) {
        void queryClient.invalidateQueries({
          queryKey: CONTENT_QUERY_KEYS.list(slug),
        });
      }
      const failed = failedItems(response);
      if (failed.length === 0) {
        reset();
        onImported(response.succeeded);
        return;
      }
      // Keep only what failed, so a second submit cannot create duplicates.
      form.setValue(
        'payload',
        JSON.stringify(
          failed.map((item) => input.items[item.index]),
          null,
          2,
        ),
      );
      setProblems(
        failed.map((item) => ({
          position: item.index + 1,
          reason: itemReason(
            item.errorCode,
            item.message,
            copy.invalidFallback,
          ),
        })),
      );
      setPartial(copy.partial(response.succeeded, failed.length));
      setAlert(null);
    },
    onError: (cause) => {
      const failure = toBulkFailure(cause);
      setPartial(null);
      if (failure.index === undefined) {
        setProblems([]);
        setAlert(failure.message);
      } else {
        setAlert(
          copy.atomicFailed(
            failure.index + 1,
            failure.reason ?? copy.invalidFallback,
          ),
        );
        setProblems([]);
      }
    },
  });

  const payload = useWatch({ control: form.control, name: 'payload' });
  const parsed = payload.trim() === '' ? null : parseImportText(payload);
  const count = parsed !== null && 'items' in parsed ? parsed.items.length : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || run.isPending) return;
        reset();
        onClose();
      }}
    >
      <DialogContent className="max-w-2xl" onCloseAutoFocus={onCloseAutoFocus}>
        <FormProvider {...form}>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(event) =>
              void form.handleSubmit((values) => {
                const parsedImport = parseImportText(values.payload);
                if ('items' in parsedImport) {
                  setAlert(null);
                  setProblems([]);
                  setPartial(null);
                  run.mutate({
                    items: parsedImport.items,
                    atomic: values.atomic,
                  });
                }
              })(event)
            }
          >
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>
                {copy.description(BULK_MAX_ITEMS)}
              </DialogDescription>
            </DialogHeader>
            {alert === null ? null : (
              <FormAlert tone="error">{alert}</FormAlert>
            )}
            {partial === null ? null : (
              <FormAlert tone="warning">{partial}</FormAlert>
            )}
            {problems.length === 0 ? null : (
              <ul className="m-0 grid list-none gap-1 p-0 text-sm text-destructive-strong">
                {problems.map((problem) => (
                  <li key={problem.position}>
                    {copy.itemError(problem.position, problem.reason)}
                  </li>
                ))}
              </ul>
            )}
            <JsonInput<FormValues>
              name="payload"
              label={copy.label}
              invalidMessage={copy.invalidJson}
              placeholder={copy.placeholder}
              rows={12}
              rules={{
                required: copy.empty,
                validate: (value) => {
                  const parsedImport = parseImportText(String(value));
                  return 'error' in parsedImport ? parsedImport.error : true;
                },
              }}
            />
            <CheckboxInput<FormValues>
              name="atomic"
              label={copy.atomic}
              description={copy.atomicHint}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" disabled={run.isPending}>
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button type="submit" variant="primary" loading={run.isPending}>
                {count > 0 ? copy.submit(count) : copy.submitEmpty}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
