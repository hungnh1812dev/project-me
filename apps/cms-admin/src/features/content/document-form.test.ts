import { CV_PAGE_TYPE } from '../../../test/cv-page.fixture';
import { ITEM_UID_KEY } from '../../config/content.constants';
import {
  emptyItem,
  type FormValues,
  toDocumentTree,
  toFormValues,
} from './document-form';
import { buildFieldTree } from './field-tree';

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
    company: 'Acme',
    summary: '<p>Hi</p>',
  },
  components: {
    skill: [
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
    experience: [
      {
        componentUid: UID_ROLE,
        values: { company: 'Acme', location: null },
        components: {
          role: [
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
    expect(form.skill).toEqual([]);
  });

  it('loads values, component uids and nested items', () => {
    const form = toFormValues(tree, record);
    expect(form.position).toBe('Engineer');
    expect(form.isMain).toBe(true);
    expect((form.skill as FormValues[])[1]).toEqual({
      [ITEM_UID_KEY]: UID_B,
      level: 'Mid',
      skill: 'Node',
    });
    const role = (
      (form.experience as FormValues[])[0]!.role as FormValues[]
    )[0]!;
    expect(role.teamSize).toBe('5');
    expect(role.techStack).toBe('[\n  "ts"\n]');
  });

  it('builds a blank item with an empty uid', () => {
    const item = emptyItem(node('experience'));
    expect(item).toMatchObject({ [ITEM_UID_KEY]: '', company: '', role: [] });
  });
});

describe('toDocumentTree on create', () => {
  it('sends only filled fields and omits empty component lists', () => {
    const form = toFormValues(tree, null);
    form.position = 'Engineer';
    form.skill = [{ ...emptyItem(node('skill')), skill: 'React' }];
    expect(toDocumentTree(tree, form, null, NONE)).toEqual({
      values: { position: 'Engineer', isMain: false },
      components: { skill: [{ values: { skill: 'React' } }] },
    });
  });

  it('never sends richtext (editor not built yet)', () => {
    const form = toFormValues(tree, null);
    form.summary = '<p>x</p>';
    expect(toDocumentTree(tree, form, null, NONE).values).not.toHaveProperty(
      'summary',
    );
  });
});

describe('toDocumentTree on update', () => {
  const initial = toFormValues(tree, record);

  it('sends nothing when nothing changed', () => {
    expect(
      toDocumentTree(tree, structuredClone(initial), initial, NONE),
    ).toEqual({});
  });

  it('sends only the changed top-level fields, null for a cleared one', () => {
    const form = structuredClone(initial);
    form.position = 'Lead';
    form.company = '';
    expect(toDocumentTree(tree, form, initial, NONE)).toEqual({
      values: { position: 'Lead', company: null },
    });
  });

  it('keeps the uid of existing items and omits it for new ones, in the new order', () => {
    const form = structuredClone(initial);
    const [first, second] = form.skill as FormValues[];
    form.skill = [second, first, { ...emptyItem(node('skill')), skill: 'Go' }];
    const body = toDocumentTree(tree, form, initial, NONE);
    expect(body.values).toBeUndefined();
    expect(body.components?.skill).toEqual([
      { componentUid: UID_B, values: { level: 'Mid', skill: 'Node' } },
      { componentUid: UID_A, values: { level: 'Senior', skill: 'React' } },
      { values: { skill: 'Go' } },
    ]);
  });

  it('sends an empty list when every item was removed', () => {
    const form = structuredClone(initial);
    form.skill = [];
    expect(toDocumentTree(tree, form, initial, NONE).components).toEqual({
      skill: [],
    });
  });

  it('sends nested components with their uids', () => {
    const form = structuredClone(initial);
    ((form.experience as FormValues[])[0]!.role as FormValues[])[0]!.position =
      'Lead';
    const body = toDocumentTree(tree, form, initial, NONE);
    const experience = body.components?.experience?.[0];
    expect(experience?.componentUid).toBe(UID_ROLE);
    expect(experience?.components?.role?.[0]).toMatchObject({
      componentUid: '00000000-0000-4000-8000-0000000000d1',
      values: { position: 'Lead', teamSize: 5, techStack: ['ts'] },
    });
  });

  it('never sends masked paths, even when they differ', () => {
    const masked = new Set(['company', 'reference', 'experience.location']);
    const form = structuredClone(initial);
    form.company = 'changed';
    form.position = 'Lead';
    (form.experience as FormValues[])[0]!.location = 'Hanoi';
    const body = toDocumentTree(tree, form, initial, masked);
    expect(body.values).toEqual({ position: 'Lead' });
    expect(body.components?.experience?.[0]?.values).not.toHaveProperty(
      'location',
    );
    expect(body.components).not.toHaveProperty('reference');
  });
});
