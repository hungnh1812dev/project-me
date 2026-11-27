import { CV_PAGE_TYPE } from '@test/CvPage.fixture';

import { buildFieldTree, labelOf } from './FieldTree.rules';

describe('labelOf', () => {
  it.each([
    ['position', 'Position'],
    ['techStack', 'Tech Stack'],
    ['isMain', 'Is Main'],
    ['liveLink', 'Live Link'],
    ['teamSize', 'Team Size'],
  ])('%s -> %s', (name, label) => {
    expect(labelOf(name)).toBe(label);
  });
});

describe('buildFieldTree (page-cv-a)', () => {
  const tree = buildFieldTree(CV_PAGE_TYPE.fields);

  it('keeps root fields in definition order', () => {
    expect(tree.map((node) => node.name)).toEqual([
      'name',
      'position',
      'isMain',
      'summary',
      'skills',
      'experiences',
      'projects',
      'educations',
      'languages',
      'references',
    ]);
  });

  it('nests components to depth 2 with full paths', () => {
    const experience = tree.find((node) => node.name === 'experiences');
    expect(experience?.repeatable).toBe(true);
    const role = experience?.children.find((node) => node.name === 'roles');
    expect(role?.path).toBe('experiences.roles');
    expect(role?.children.map((node) => node.name)).toContain('techStacks');
    expect(role?.children.find((node) => node.name === 'teamSize')?.type).toBe('integer');
  });

  it('uses displayName over the generated label and defaults the width to full', () => {
    const { width: _width, ...base } = CV_PAGE_TYPE.fields[0]!;
    const built = buildFieldTree([
      { ...base, path: 'techStack', displayName: 'Stack' },
      { ...base, path: 'isMain', width: '1/3' },
      { ...base, path: 'summary' },
    ]);
    expect(built.map((node) => [node.label, node.width])).toEqual([
      ['Stack', 'full'],
      ['Is Main', '1/3'],
      ['Summary', 'full'],
    ]);
  });

  it('skips system fields and drops fields whose parent is not reachable', () => {
    const built = buildFieldTree([
      { ...CV_PAGE_TYPE.fields[0]!, path: 'createdBy', system: true },
      { ...CV_PAGE_TYPE.fields[0]!, path: 'hidden.child' },
      { ...CV_PAGE_TYPE.fields[0]!, path: 'title' },
    ]);
    expect(built.map((node) => node.path)).toEqual(['title']);
  });
});

describe('buildFieldTree defaults', () => {
  const base = { system: false, component: false, repeatable: false, rootScalar: true };
  const field = (path: string, extra: { type: string; default?: unknown }) => ({
    ...base,
    path,
    conditionKind: null,
    sensitive: false,
    ...extra,
  });

  it('carries a default as defaultValue, even a falsy one', () => {
    const tree = buildFieldTree([
      field('count', { type: 'integer', default: 0 }),
      field('active', { type: 'boolean', default: false }),
      field('title', { type: 'text' }),
    ]);
    expect(tree[0]?.defaultValue).toBe(0);
    expect(tree[1]?.defaultValue).toBe(false);
    expect(tree[2]).not.toHaveProperty('defaultValue');
  });

  it('carries titleField and subtitleField of a component, and omits them when unset', () => {
    const tree = buildFieldTree([
      {
        ...base,
        path: 'jobs',
        type: 'component',
        component: true,
        repeatable: true,
        rootScalar: false,
        conditionKind: null,
        sensitive: false,
        titleField: 'role',
        subtitleField: 'company',
      },
      field('plain', { type: 'text' }),
    ]);
    expect(tree[0]).toMatchObject({ titleField: 'role', subtitleField: 'company' });
    expect(tree[1]).not.toHaveProperty('titleField');
    expect(tree[1]).not.toHaveProperty('subtitleField');
  });
});
