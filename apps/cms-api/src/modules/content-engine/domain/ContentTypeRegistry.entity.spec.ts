import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ContentEngineError } from './ContentDocument.entity';
import { CONTENT_ERROR_CODES } from './ContentEngine.constants';
import { ContentTypeRegistry, UnknownContentTypeError } from './ContentTypeRegistry.entity';

const PAGE_CV_A_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'content',
  'schemas',
  'page-cv-a.json',
);

function loadPageCvA(): Record<string, unknown> {
  return JSON.parse(readFileSync(PAGE_CV_A_PATH, 'utf8')) as Record<string, unknown>;
}

describe('ContentTypeRegistry', () => {
  it('builds the table tree of page-cv-a from planTables()', () => {
    const type = ContentTypeRegistry.fromDefinitions([loadPageCvA()]).resolve('page-cv-a');
    expect(type.root.plan.name).toBe('page_cv_a');
    expect(type.root.components.map((c) => c.table.plan.name)).toEqual([
      'page_cv_a__skill',
      'page_cv_a__experience',
      'page_cv_a__project',
      'page_cv_a__education',
    ]);
    const experience = type.root.components[1]?.table;
    expect(experience?.components.map((c) => c.table.plan.name)).toEqual([
      'page_cv_a__experience__role',
    ]);
    // API name -> column name (camelCase -> snake_case).
    expect(experience?.components[0]?.table.columnsByField.get('teamSize')?.name).toBe('team_size');
    expect(type.root.columnsByField.get('isMain')?.name).toBe('is_main');
  });

  it('throws a typed error for an unknown slug', () => {
    const registry = ContentTypeRegistry.fromDefinitions([loadPageCvA()]);
    expect(() => registry.resolve('page_cv_a')).toThrow(UnknownContentTypeError);
    expect(() => registry.resolve('__proto__')).toThrow(UnknownContentTypeError);
    expect(new UnknownContentTypeError('x').code).toBe(CONTENT_ERROR_CODES.CONTENT_TYPE_UNKNOWN);
  });

  it('lists the registered definitions', () => {
    const registry = ContentTypeRegistry.fromDefinitions([loadPageCvA()]);
    expect(registry.definitions().map((definition) => definition.slug)).toEqual(['page-cv-a']);
  });

  it('refuses an invalid definition', () => {
    const broken = { ...loadPageCvA(), slug: 'Bad Slug' };
    expect(() => ContentTypeRegistry.fromDefinitions([broken])).toThrow(ContentEngineError);
  });
});
