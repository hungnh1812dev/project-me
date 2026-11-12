import { useState } from 'react';
import { EN_TEXT } from '@configs/locales/en';
import { createTestServices, renderInApp } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExportPanel } from './ExportPanel';
import { createNewSchemaTree, type SchemaTree } from './SchemaTree.reducer';

const copy = EN_TEXT.schemaBuilder.export;
const VALID = { valid: true, errors: [] };
const tree: SchemaTree = { ...createNewSchemaTree(), slug: 'cv-page', changedSinceSnapshot: true };

function show(props: Partial<Parameters<typeof ExportPanel>[0]> = {}) {
  const onExported = vi.fn<() => void>();
  const view = renderInApp(
    createTestServices().services,
    <ExportPanel
      tree={tree}
      status="checked"
      validation={VALID}
      isResultCurrent
      onExported={onExported}
      {...props}
    />,
  );
  return { onExported, ...view };
}

const exportButtons = () => [
  screen.getByRole('button', { name: copy.copy }),
  screen.getByRole('button', { name: copy.download }),
];

describe('ExportPanel', () => {
  it.each([
    ['checking', { status: 'checking', isResultCurrent: false }, copy.reason.checking],
    ['unavailable', { status: 'unavailable', isResultCurrent: false }, copy.reason.unavailable],
    ['invalid', { validation: { valid: false, errors: [] } }, copy.reason.invalid],
    ['stale', { isResultCurrent: false }, copy.reason.checking],
  ] as [string, Partial<Parameters<typeof ExportPanel>[0]>, string][])(
    'is off while %s, with the reason',
    async (_name, props, reason) => {
      show(props);
      await screen.findByText(reason);
      for (const button of exportButtons()) expect(button).toBeDisabled();
    },
  );

  it('is on for a current result without errors', async () => {
    show();
    await screen.findByRole('button', { name: copy.copy });
    for (const button of exportButtons()) expect(button).toBeEnabled();
  });

  it('copies the JSON, then shows the next steps and reports the export', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { onExported } = show();
    await userEvent.click(await screen.findByRole('button', { name: copy.copy }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^\{\n {2}"slug": "cv-page"/));
    expect(writeText.mock.calls[0]?.[0]).toMatch(/\n$/);
    expect(onExported).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('shows the next steps after an export, until the tree changes again', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined),
      },
    });
    function Harness() {
      const [current, setCurrent] = useState(tree);
      return (
        <>
          <button onClick={() => setCurrent({ ...current, changedSinceSnapshot: true })}>
            edit
          </button>
          <ExportPanel
            tree={current}
            status="checked"
            validation={VALID}
            isResultCurrent
            onExported={() => setCurrent({ ...current, changedSinceSnapshot: false })}
          />
        </>
      );
    }
    renderInApp(createTestServices().services, <Harness />);
    expect(screen.queryByText(copy.nextSteps.heading)).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: copy.copy }));
    expect(await screen.findByText(copy.nextSteps.heading)).toBeVisible();
    for (const step of copy.nextSteps.steps) expect(screen.getByText(step)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'edit' }));
    expect(screen.queryByText(copy.nextSteps.heading)).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('downloads <slug>.json and revokes the Blob URL', async () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValue('blob:schema');
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });
    const { onExported } = show();
    await userEvent.click(await screen.findByRole('button', { name: copy.download }));
    expect(downloads).toEqual(['cv-page.json']);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:schema');
    expect(onExported).toHaveBeenCalledOnce();
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('tells the user when the browser blocks copying', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('blocked')),
      },
    });
    const { onExported } = show();
    await userEvent.click(await screen.findByRole('button', { name: copy.copy }));
    expect(await screen.findByText(copy.copyFailed)).toBeVisible();
    expect(onExported).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
