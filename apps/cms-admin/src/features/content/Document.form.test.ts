import { CV_PAGE_TYPE } from '@test/CvPage.fixture';

import { ITEM_UID_KEY } from './Content.constants';
import { emptyItem, toDocumentTree, toFormValues, type FormValues } from './Document.form';
import { buildFieldTree } from './FieldTree.rules';

const tree = buildFieldTree(CV_PAGE_TYPE.fields);
const node = (name: string) => tree.find((item) => item.name === name)!;
const NONE: ReadonlySet<string> = new Set();

const UID_A = '00000000-0000-4000-8000-00000000000a';
const UID_B = '00000000-0000-4000-8000-00000000000b';
const UID_ROLE = '00000000-0000-4000-8000-0000000000c1';

const record = {
  values: {
    position: 'Engineer',
    isMain: true,
    name: 'Acme',
    summary: '<p>Hi</p>',
  },
  components: {
    skills: [
      {
        componentUid: UID_A,
        values: { level: 'Senior', skill: 'React' },
        components: {},
      },
      {
        componentUid: UID_B,
        values: { level: 'Mid', skill: 'Node' },
        components: {},
      },
    ],
    experiences: [
      {
        componentUid: UID_ROLE,
        values: { company: 'Acme', location: null },
        components: {
          roles: [
            {
              componentUid: '00000000-0000-4000-8000-0000000000d1',
              values: { position: 'Dev', teamSize: 5, techStack: ['ts'] },
              components: {},
            },
          ],
        },
      },
    ],
  },
};

describe('toFormValues', () => {
  it('is blank for a new document', () => {
    const form = toFormValues(tree, null);
    expect(form.position).toBe('');
    expect(form.isMain).toBe(false);
    expect(form.skills).toEqual([]);
  });

  it('loads values, component uids and nested items', () => {
    const form = toFormValues(tree, record);
    expect(form.position).toBe('Engineer');
    expect(form.isMain).toBe(true);
    expect((form.skills as FormValues[])[1]).toEqual({
      [ITEM_UID_KEY]: UID_B,
      level: 'Mid',
      skill: 'Node',
    });
    const role = ((form.experiences as FormValues[])[0]!.roles as FormValues[])[0]!;
    expect(role.teamSize).toBe('5');
    expect(role.techStack).toBe('[\n  "ts"\n]');
  });

  it('builds a blank item with an empty uid', () => {
    const item = emptyItem(node('experiences'));
    expect(item).toMatchObject({ [ITEM_UID_KEY]: '', company: '', roles: [] });
  });
});

describe('toDocumentTree on create', () => {
  it('sends only filled fields and omits empty component lists', () => {
    const form = toFormValues(tree, null);
    form.position = 'Engineer';
    form.skills = [{ ...emptyItem(node('skills')), skill: 'React' }];
    expect(toDocumentTree(tree, form, null, NONE)).toEqual({
      values: { position: 'Engineer', isMain: false },
      components: { skills: [{ values: { skill: 'React' } }] },
    });
  });

  it('sends richtext as HTML and blank richtext as null', () => {
    const form = toFormValues(tree, null);
    form.summary = '<p>x</p>';
    expect(toDocumentTree(tree, form, null, NONE).values).toMatchObject({
      summary: '<p>x</p>',
    });
    form.summary = '';
    expect(toDocumentTree(tree, form, null, NONE).values).not.toHaveProperty('summary');
  });
});

describe('toDocumentTree on update', () => {
  const initial = toFormValues(tree, record);

  it('sends nothing when nothing changed', () => {
    expect(toDocumentTree(tree, structuredClone(initial), initial, NONE)).toEqual({});
  });

  it('sends only the changed top-level fields, null for a cleared one', () => {
    const form = structuredClone(initial);
    form.position = 'Lead';
    form.name = '';
    expect(toDocumentTree(tree, form, initial, NONE)).toEqual({
      values: { position: 'Lead', name: null },
    });
  });

  it('keeps the uid of existing items and omits it for new ones, in the new order', () => {
    const form = structuredClone(initial);
    const [first, second] = form.skills as FormValues[];
    form.skills = [second, first, { ...emptyItem(node('skills')), skill: 'Go' }];
    const body = toDocumentTree(tree, form, initial, NONE);
    expect(body.values).toBeUndefined();
    expect(body.components?.skills).toEqual([
      { componentUid: UID_B, values: { level: 'Mid', skill: 'Node' } },
      { componentUid: UID_A, values: { level: 'Senior', skill: 'React' } },
      { values: { skill: 'Go' } },
    ]);
  });

  it('sends an empty list when every item was removed', () => {
    const form = structuredClone(initial);
    form.skills = [];
    expect(toDocumentTree(tree, form, initial, NONE).components).toEqual({
      skills: [],
    });
  });

  it('sends nested components with their uids', () => {
    const form = structuredClone(initial);
    ((form.experiences as FormValues[])[0]!.roles as FormValues[])[0]!.position = 'Lead';
    const body = toDocumentTree(tree, form, initial, NONE);
    const experience = body.components?.experiences?.[0];
    expect(experience?.componentUid).toBe(UID_ROLE);
    expect(experience?.components?.roles?.[0]).toMatchObject({
      componentUid: '00000000-0000-4000-8000-0000000000d1',
      values: { position: 'Lead', teamSize: 5, techStack: ['ts'] },
    });
  });

  it('never sends masked paths, even when they differ', () => {
    const masked = new Set(['name', 'references', 'experiences.location']);
    const form = structuredClone(initial);
    form.name = 'changed';
    form.position = 'Lead';
    (form.experiences as FormValues[])[0]!.location = 'Hanoi';
    const body = toDocumentTree(tree, form, initial, masked);
    expect(body.values).toEqual({ position: 'Lead' });
    expect(body.components?.experiences?.[0]?.values).not.toHaveProperty('location');
    expect(body.components).not.toHaveProperty('references');
  });
});
