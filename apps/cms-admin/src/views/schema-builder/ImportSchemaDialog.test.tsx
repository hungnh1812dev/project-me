import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ImportSchemaDialog } from './ImportSchemaDialog';
import { MAX_IMPORT_FIELDS } from './SchemaTree.reducer';

const copy = EN_TEXT.schemaBuilder.import;

function show() {
  const onLoad = vi.fn<(tree: object) => void>();
  const onClose = vi.fn<() => void>();
  renderInApp(
    createTestServices().services,
    <ImportSchemaDialog onLoad={onLoad} onClose={onClose} onCloseAutoFocus={() => undefined} />,
  );
  return { onLoad, onClose };
}

async function pasted(text: string) {
  await userEvent.click(screen.getByLabelText(copy.textLabel));
  await userEvent.paste(text);
}

describe('ImportSchemaDialog', () => {
  it.each([
    ['not JSON', 'nope', copy.refusal.notJson],
    ['a list', '[]', copy.refusal.notObject],
    ['no fields list', '{"slug":"a"}', copy.refusal.fieldsMissing],
    ['a field that is not an object', '{"slug":"a","fields":[1]}', copy.refusal.fieldNotObject],
    [
      'more fields than the cap',
      JSON.stringify({
        slug: 'a',
        fields: Array.from({ length: MAX_IMPORT_FIELDS + 1 }, (_, i) => ({
          name: `f${i}`,
          type: 'string',
        })),
      }),
      copy.refusal.tooManyFields(MAX_IMPORT_FIELDS),
    ],
  ])('refuses %s with one message and loads nothing', async (_name, text, message) => {
    const { onLoad, onClose } = show();
    await screen.findByRole('dialog');
    await pasted(text);
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));
    expect(await screen.findByText(message)).toBeVisible();
    expect(onLoad).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks for input when nothing was given', async () => {
    const { onLoad } = show();
    await userEvent.click(await screen.findByRole('button', { name: copy.submit }));
    expect(await screen.findByText(copy.empty)).toBeVisible();
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('loads pasted JSON, even one the validator will reject', async () => {
    const { onLoad } = show();
    await screen.findByRole('dialog');
    await pasted('{"slug":"Bad Slug","fields":[]}');
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));
    expect(onLoad).toHaveBeenCalledOnce();
    expect(onLoad.mock.calls[0]?.[0]).toMatchObject({ slug: 'Bad Slug', fields: [] });
  });

  it('reads a picked .json file into the text box', async () => {
    const { onLoad } = show();
    const file = new File(['{"slug":"cv-page","fields":[]}'], 'cv-page.json', {
      type: 'application/json',
    });
    await userEvent.upload(await screen.findByLabelText(copy.fileLabel), file);
    await vi.waitFor(() =>
      expect(screen.getByLabelText(copy.textLabel)).toHaveValue('{"slug":"cv-page","fields":[]}'),
    );
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));
    expect(onLoad.mock.calls[0]?.[0]).toMatchObject({ slug: 'cv-page' });
  });

  it('closes on Cancel', async () => {
    const { onClose } = show();
    await userEvent.click(await screen.findByRole('button', { name: copy.cancel }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
