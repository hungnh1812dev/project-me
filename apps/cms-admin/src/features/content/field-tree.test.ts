import { CV_PAGE_TYPE } from '../../../test/CvPage.fixture';
import { buildFieldTree, labelOf } from './field-tree';

describe('labelOf', () => {
  it.each([
    ['position', 'Position'],
    ['techStack', 'Tech stack'],
    ['isMain', 'Is main'],
    ['liveLink', 'Live link'],
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
      'company',
      'summary',
      'skill',
      'experience',
      'project',
      'education',
      'language',
      'reference',
    ]);
  });

  it('nests components to depth 2 with full paths', () => {
    const experience = tree.find((node) => node.name === 'experience');
    expect(experience?.repeatable).toBe(true);
    const role = experience?.children.find((node) => node.name === 'role');
    expect(role?.path).toBe('experience.role');
    expect(role?.children.map((node) => node.name)).toContain('techStack');
    expect(role?.children.find((node) => node.name === 'teamSize')?.type).toBe(
      'integer',
    );
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
