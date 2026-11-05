import { render } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

import { FIELD_COLUMN_SPAN } from './Content.constants';
import { DynamicFormRenderer } from './DynamicFormRenderer';
import type { FieldNode } from './FieldTree.rules';

const field = (name: string, width: FieldNode['width'], children: FieldNode[] = []): FieldNode => ({
  name,
  path: name,
  type: children.length > 0 ? 'component' : 'text',
  label: name,
  width,
  repeatable: true,
  children,
});

function Harness({ fields }: { fields: FieldNode[] }) {
  const form = useForm();
  return (
    <FormProvider {...form}>
      <DynamicFormRenderer fields={fields} masked={new Set()} />
    </FormProvider>
  );
}

describe('DynamicFormRenderer field widths', () => {
  it('puts each field in a 6-column grid cell sized by its width', () => {
    const { container } = render(
      <Harness fields={[field('third', '1/3'), field('half', '1/2'), field('whole', 'full')]} />,
    );
    const cells = [...container.querySelectorAll('input')].map((input) =>
      input.closest('[class*="col-span"]'),
    );
    expect(cells.map((cell) => cell?.className)).toEqual([
      FIELD_COLUMN_SPAN['1/3'],
      FIELD_COLUMN_SPAN['1/2'],
      FIELD_COLUMN_SPAN.full,
    ]);
    expect(container.firstElementChild).toHaveClass('grid-cols-1', 'sm:grid-cols-6');
  });

  it('spans the whole row for a component group', () => {
    const { container } = render(<Harness fields={[field('items', '1/3', [field('a', '1/3')])]} />);
    expect(container.querySelector('section')?.parentElement).toHaveClass(FIELD_COLUMN_SPAN.full);
  });
});
