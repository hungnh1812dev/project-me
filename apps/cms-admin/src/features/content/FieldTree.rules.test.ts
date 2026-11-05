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

describe('buildFieldTree (cv-page)', () => {
  const tree = buildFieldTree(CV_PAGE_TYPE.fields);

  it('keeps root fields in definition order', () => {
    expect(tree.map((node) => node.name)).toEqual([
      'position',
      'isMain',
      'name',
      'summary',
      'skills',
      'experiences',
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
    const project = role?.children.find((node) => node.name === 'projects');
    expect(project?.path).toBe('experiences.roles.projects');
    expect(role?.children.map((node) => node.name)).toContain('techStack');
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
