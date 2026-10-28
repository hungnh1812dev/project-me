import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildSchema, parse, validate } from 'graphql';

import { CV_PAGE_DOCUMENT } from './Cv.graphql';

// Read by path: the web app never imports cms-api code.
const SDL_PATH = resolve(
  import.meta.dirname,
  '../../../../cms-api/content/schema.graphql',
);
const schema = buildSchema(readFileSync(SDL_PATH, 'utf8'));

describe('CvPage document', () => {
  it('is valid against the generated cms-api schema', () => {
    expect(validate(schema, parse(CV_PAGE_DOCUMENT.query))).toEqual([]);
  });

  it('fails on a field the schema does not have', () => {
    const unknown = CV_PAGE_DOCUMENT.query.replace('position', 'posistion');
    expect(validate(schema, parse(unknown)).length).toBeGreaterThan(0);
  });

  it('names its operation', () => {
    expect(CV_PAGE_DOCUMENT.query).toContain(
      `query ${CV_PAGE_DOCUMENT.operationName}`,
    );
  });
});
