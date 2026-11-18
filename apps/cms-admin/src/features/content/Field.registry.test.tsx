import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EN_TEXT } from '@configs/locales/en';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';

import { FIELD_TYPE, MASKED_VALUE } from './Content.constants';
import {
  adapterFor,
  FIELD_REGISTRY,
  formatListValue,
  isSortableListType,
  listAlignmentOf,
} from './Field.registry';

describe('adapterFor richtext', () => {
  const adapter = adapterFor('richtext');

  it('is editable and round-trips HTML text', () => {
    expect(adapter.editable).toBe(true);
    expect(adapter.toForm('<p>x</p>')).toBe('<p>x</p>');
    expect(adapter.toForm(null)).toBe('');
    expect(adapter.toApi('<p>x</p>')).toBe('<p>x</p>');
    expect(adapter.toApi('')).toBeNull();
  });
});

describe('adapterFor media', () => {
  const adapter = adapterFor('media');
  const file = { id: 'u1', fileName: 'a.jpg' };

  it('is editable, keeps the embedded file and sends only its uuid', () => {
    expect(adapter.editable).toBe(true);
    expect(adapter.toForm(file)).toEqual(file);
    expect(adapter.toForm(null)).toBeNull();
    expect(adapter.toForm(7)).toBeNull();
    expect(adapter.toApi(file)).toBe('u1');
    expect(adapter.toApi(null)).toBeNull();
  });
});

describe('list display', () => {
  it('has an entry for every non-component field type', () => {
    const types = Object.values(FIELD_TYPE).filter((type) => type !== FIELD_TYPE.COMPONENT);
    expect(types.filter((type) => !(type in FIELD_REGISTRY))).toEqual([]);
  });

  it('marks scalar types sortable and the rest not', () => {
    expect(isSortableListType('string')).toBe(true);
    expect(isSortableListType('datetime')).toBe(true);
    expect(isSortableListType('json')).toBe(false);
    expect(isSortableListType('richtext')).toBe(false);
    expect(isSortableListType('media')).toBe(false);
    expect(isSortableListType('unknown')).toBe(false);
  });

  it('right-aligns the number types', () => {
    for (const type of ['biginteger', 'float', 'double']) {
      expect(listAlignmentOf(type)).toBe('right');
    }
    expect(listAlignmentOf('time')).toBe('left');
    expect(listAlignmentOf('enumeration')).toBe('left');
  });

  it('right-aligns numbers only', () => {
    expect(listAlignmentOf('integer')).toBe('right');
    expect(listAlignmentOf('decimal')).toBe('right');
    expect(listAlignmentOf('string')).toBe('left');
  });

  it('formats empty, masked, boolean, datetime and plain values', () => {
    const empty = EN_TEXT.content.collection.emptyValue;
    expect(formatListValue('string', null, EN_TEXT.content)).toBe(empty);
    expect(formatListValue('string', '', EN_TEXT.content)).toBe(empty);
    expect(formatListValue('string', MASKED_VALUE, EN_TEXT.content)).toBe(
      EN_TEXT.content.collection.protectedValue,
    );
    expect(formatListValue('boolean', true, EN_TEXT.content)).toBe(EN_TEXT.content.collection.yes);
    expect(formatListValue('boolean', false, EN_TEXT.content)).toBe(EN_TEXT.content.collection.no);
    expect(formatListValue('integer', 7, EN_TEXT.content)).toBe('7');
    expect(formatListValue('string', { a: 1 }, EN_TEXT.content)).toBe(empty);
    expect(formatListValue('datetime', 'not a date', EN_TEXT.content)).toBe('not a date');
    expect(formatListValue('datetime', '2026-01-02T03:04:05Z', EN_TEXT.content)).not.toBe(empty);
  });

  it('keeps CollectionListPage free of FIELD_TYPE', () => {
    const page = readFileSync(
      join(import.meta.dirname, '../../views/collection-list/CollectionListPage.tsx'),
      'utf8',
    );
    expect(page).not.toContain('FIELD_TYPE');
  });
});

describe('adapterFor text and string', () => {
  function Field({ type }: { type: string }) {
    const form = useForm();
    return (
      <FormProvider {...form}>
        {adapterFor(type).render({ name: 'value', label: 'Value', copy: EN_TEXT.content })}
      </FormProvider>
    );
  }

  it('shows text as a one-line input', () => {
    render(<Field type={FIELD_TYPE.TEXT} />);
    expect(screen.getByLabelText('Value').tagName).toBe('INPUT');
  });

  it('shows string as a multi-line text area', () => {
    render(<Field type={FIELD_TYPE.STRING} />);
    expect(screen.getByLabelText('Value').tagName).toBe('TEXTAREA');
  });
});

describe('adapterFor the new number and time types', () => {
  it('keeps a big integer as the same digit string both ways', () => {
    const adapter = adapterFor(FIELD_TYPE.BIGINTEGER);
    expect(adapter.toForm('9007199254740993')).toBe('9007199254740993');
    expect(adapter.toApi('9007199254740993')).toBe('9007199254740993');
    expect(adapter.toApi('')).toBeNull();
  });

  it('sends float and double as numbers', () => {
    for (const type of [FIELD_TYPE.FLOAT, FIELD_TYPE.DOUBLE]) {
      expect(adapterFor(type).toApi('12.5')).toBe(12.5);
      expect(adapterFor(type).toApi('')).toBeNull();
    }
  });

  it('keeps time seconds when given', () => {
    const adapter = adapterFor(FIELD_TYPE.TIME);
    expect(adapter.toApi('09:30')).toBe('09:30');
    expect(adapter.toApi('09:30:15')).toBe('09:30:15');
    expect(adapter.toForm('09:30:15')).toBe('09:30:15');
    expect(adapter.toApi('')).toBeNull();
  });
});

describe('adapterFor enumeration', () => {
  const options = ['draft', 'live'];

  function Field({ stored }: { stored: string }) {
    const form = useForm({ defaultValues: { value: stored } });
    return (
      <FormProvider {...form}>
        {adapterFor(FIELD_TYPE.ENUMERATION).render({
          name: 'value',
          label: 'Value',
          options,
          copy: EN_TEXT.content,
        })}
      </FormProvider>
    );
  }

  const optionTexts = () => screen.getAllByRole('option').map((option) => option.textContent);

  it('lists an empty choice and the options', () => {
    render(<Field stored="live" />);
    expect(optionTexts()).toEqual([EN_TEXT.content.enumeration.emptyChoice, 'draft', 'live']);
  });

  it('shows a stored value that is no longer listed as "not allowed" until another is picked', async () => {
    render(<Field stored="old" />);
    const notAllowed = EN_TEXT.content.enumeration.notAllowed('old');
    expect(optionTexts()).toContain(notAllowed);
    expect(screen.getByLabelText('Value')).toHaveValue('old');
    await userEvent.selectOptions(screen.getByLabelText('Value'), 'live');
    expect(optionTexts()).not.toContain(notAllowed);
  });
});
