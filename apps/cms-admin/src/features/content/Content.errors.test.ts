import { EN_TEXT } from '@configs/locales/en';
import { AxiosError, type AxiosResponse } from 'axios';
import type { FieldErrors } from 'react-hook-form';

import { invalidItemChainsOf, refusedItemPathOf, toSaveError } from './Content.errors';

function refused(data: Record<string, unknown>, status = 400): AxiosError {
  const response = { status, data, headers: {}, statusText: '', config: {} } as AxiosResponse;
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

function invalid(path?: unknown): AxiosError {
  return refused({
    errorCode: 'DOCUMENT_INVALID',
    message: 'refused',
    ...(path === undefined ? {} : { details: { path } }),
  });
}

describe('refusedItemPathOf', () => {
  it('gives none for a root value', () => {
    expect(refusedItemPathOf(invalid('values.position'))).toEqual([]);
  });

  it('reads one item of a root list', () => {
    expect(refusedItemPathOf(invalid('components.skills[1].values.level'))).toEqual([
      { componentName: 'skills', index: 1 },
    ]);
  });

  it('reads the chain of a nested item, outermost first', () => {
    expect(
      refusedItemPathOf(invalid('components.experiences[0].components.roles[2].values.position')),
    ).toEqual([
      { componentName: 'experiences', index: 0 },
      { componentName: 'roles', index: 2 },
    ]);
  });

  it('gives none for a required list that names no item', () => {
    expect(refusedItemPathOf(invalid('components.skills'))).toEqual([]);
  });

  it('keeps the parent items of a required nested list', () => {
    expect(refusedItemPathOf(invalid('components.experiences[3].components.roles'))).toEqual([
      { componentName: 'experiences', index: 3 },
    ]);
  });

  it('gives none without details, with an unreadable path or another answer', () => {
    expect(refusedItemPathOf(invalid())).toEqual([]);
    expect(refusedItemPathOf(invalid(42))).toEqual([]);
    expect(
      refusedItemPathOf(
        refused({ errorCode: 'DOCUMENT_VERSION_CONFLICT', details: { path: 'components.a[0]' } }),
      ),
    ).toEqual([]);
    expect(refusedItemPathOf(new Error('boom'))).toEqual([]);
  });

  it('never reads the message text', () => {
    const error = refused({
      errorCode: 'DOCUMENT_INVALID',
      message: 'components.skills[0].values.level is required',
    });
    expect(refusedItemPathOf(error)).toEqual([]);
  });
});

describe('toSaveError', () => {
  it('carries the refused items of a refused save', () => {
    const saveError = toSaveError(invalid('components.skills[0].values.level'), EN_TEXT);
    expect(saveError.refusedItems).toEqual([{ componentName: 'skills', index: 0 }]);
  });
});

describe('invalidItemChainsOf', () => {
  const leaf = { type: 'pattern', message: 'bad' };
  const errorsOf = (tree: unknown) => tree as FieldErrors;

  it('gives none for a refused root field', () => {
    expect(invalidItemChainsOf(errorsOf({ position: leaf }))).toEqual([]);
  });

  it('reads one item level', () => {
    expect(invalidItemChainsOf(errorsOf({ skills: [undefined, { level: leaf }] }))).toEqual([
      [{ componentName: 'skills', index: 1 }],
    ]);
  });

  it('reads two levels, outermost first', () => {
    const errors = errorsOf({ experiences: [undefined, { roles: [{ teamSize: leaf }] }] });
    expect(invalidItemChainsOf(errors)).toEqual([
      [
        { componentName: 'experiences', index: 1 },
        { componentName: 'roles', index: 0 },
      ],
    ]);
  });

  it('gives one chain per item for two refused fields in two items, none repeated', () => {
    const errors = errorsOf({
      skills: [{ skill: leaf, level: leaf }, undefined, { level: leaf }],
    });
    expect(invalidItemChainsOf(errors)).toEqual([
      [{ componentName: 'skills', index: 0 }],
      [{ componentName: 'skills', index: 2 }],
    ]);
  });

  it('reads a non-repeatable component as its single item', () => {
    expect(invalidItemChainsOf(errorsOf({ profile: [{ age: leaf }] }))).toEqual([
      [{ componentName: 'profile', index: 0 }],
    ]);
  });
});
