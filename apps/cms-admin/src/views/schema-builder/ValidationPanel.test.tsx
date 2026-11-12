import { EN_TEXT } from '@configs/locales/en';
import type { DefinitionValidation } from '@features/content-types';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createNewSchemaTree, schemaTreeReducer } from './SchemaTree.reducer';
import { ValidationPanel } from './ValidationPanel';

const copy = EN_TEXT.schemaBuilder.validation;
const treeWithField = schemaTreeReducer(createNewSchemaTree(), {
  type: 'addField',
  parentId: null,
  index: 0,
  fieldType: 'string',
});
const FIELD_ID = treeWithField.lastAddedId as string;
const INVALID: DefinitionValidation = {
  valid: false,
  errors: [
    { path: ['fields', 0, 'name'], rule: 'name-format', message: 'Use lower case letters' },
    { path: ['slug'], rule: 'slug-format', message: 'Slug is empty' },
  ],
};

function show(props: Partial<Parameters<typeof ValidationPanel>[0]> = {}) {
  const onRetry = vi.fn<() => void>();
  const onSelectField = vi.fn<(fieldId: string) => void>();
  renderInApp(
    createTestServices().services,
    <ValidationPanel
      tree={treeWithField}
      status="checked"
      validation={INVALID}
      onRetry={onRetry}
      onSelectField={onSelectField}
      {...props}
    />,
  );
  return { onRetry, onSelectField };
}

describe('ValidationPanel', () => {
  it('shows the error count with rule, message and path of each error', async () => {
    show();
    expect(await screen.findByText(copy.errorCount(2))).toBeVisible();
    expect(screen.getByText('Use lower case letters')).toBeVisible();
    expect(screen.getByText('fields[0].name')).toBeVisible();
    expect(screen.getByText('name-format')).toBeVisible();
  });

  it('says there are no errors for a valid result', async () => {
    show({ validation: { valid: true, errors: [] } });
    expect(await screen.findByText(copy.valid)).toBeVisible();
  });

  it('selects the field an error points into', async () => {
    const { onSelectField } = show();
    await userEvent.click(await screen.findByRole('button', { name: /name-format/ }));
    expect(onSelectField).toHaveBeenCalledWith(FIELD_ID);
  });

  it('lists a type-level error without a select button', async () => {
    show();
    await screen.findByText('Slug is empty');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('keeps the previous result visible and marked while checking', async () => {
    show({ status: 'checking' });
    expect(await screen.findByText(copy.errorCount(2))).toBeVisible();
    expect(screen.getByText(copy.checking)).toBeVisible();
  });

  it('waits without a result yet', async () => {
    show({ status: 'checking', validation: null });
    expect(await screen.findByText(copy.waiting)).toBeVisible();
  });

  it('shows Validation unavailable with a retry, never the old result', async () => {
    const { onRetry } = show({ status: 'unavailable', validation: { valid: true, errors: [] } });
    expect(await screen.findByText(copy.unavailable)).toBeVisible();
    expect(screen.queryByText(copy.valid)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy.retry }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
