import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTENT_ERROR_CODES } from './ContentEngine.constants';
import { ContentEngineError } from './ContentDocument.entity';
import {
  ContentTypeRegistry,
  UnknownContentTypeError,
} from './ContentTypeRegistry.entity';

const CV_PAGE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'content',
  'schemas',
  'cv-page.json',
);

function loadCvPage(): Record<string, unknown> {
  return JSON.parse(readFileSync(CV_PAGE_PATH, 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('ContentTypeRegistry', () => {
  it('builds the table tree of cv-page from planTables()', () => {
    const type = ContentTypeRegistry.fromDefinitions([loadCvPage()]).resolve(
      'cv-page',
    );
    expect(type.root.plan.name).toBe('cv_page');
    expect(type.root.components.map((c) => c.table.plan.name)).toEqual([
      'cv_page__skill',
      'cv_page__experience',
      'cv_page__project',
      'cv_page__education',
      'cv_page__language',
      'cv_page__reference',
    ]);
    const experience = type.root.components[1]?.table;
    expect(experience?.components.map((c) => c.table.plan.name)).toEqual([
      'cv_page__experience__role',
    ]);
    // API name -> column name (camelCase -> snake_case).
    expect(
      experience?.components[0]?.table.columnsByField.get('teamSize')?.name,
    ).toBe('team_size');
    expect(type.root.columnsByField.get('isMain')?.name).toBe('is_main');
  });

  it('throws a typed error for an unknown slug', () => {
    const registry = ContentTypeRegistry.fromDefinitions([loadCvPage()]);
    expect(() => registry.resolve('cv_page')).toThrow(UnknownContentTypeError);
    expect(() => registry.resolve('__proto__')).toThrow(
      UnknownContentTypeError,
    );
    expect(new UnknownContentTypeError('x').code).toBe(
      CONTENT_ERROR_CODES.CONTENT_TYPE_UNKNOWN,
    );
  });

  it('refuses an invalid definition', () => {
    const broken = { ...loadCvPage(), slug: 'Bad Slug' };
    expect(() => ContentTypeRegistry.fromDefinitions([broken])).toThrow(
      ContentEngineError,
    );
  });
});
