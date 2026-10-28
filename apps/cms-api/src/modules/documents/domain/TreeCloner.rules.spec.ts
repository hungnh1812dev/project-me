import type { ContentDocument } from '../../content-engine';
import { cloneTree } from './TreeCloner.rules';

const document: ContentDocument = {
  id: 7,
  documentId: '00000000-0000-4000-8000-000000000001',
  version: 3,
  publishedAt: null,
  locale: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 1,
  updatedBy: 1,
  values: { title: 'A' },
  components: {
    reference: [
      {
        id: 11,
        componentUid: '00000000-0000-4000-8000-0000000000aa',
        orderIndex: 0,
        values: { name: 'Ann' },
        components: {
          deep: [
            {
              id: 12,
              componentUid: '00000000-0000-4000-8000-0000000000bb',
              orderIndex: 0,
              values: { x: 1 },
              components: {},
            },
          ],
        },
      },
    ],
  },
};

describe('cloneTree', () => {
  it('keeps values and component uids at every level, without row ids', () => {
    const tree = cloneTree(document);
    expect(tree.values).toEqual({ title: 'A' });
    expect(tree.components?.reference?.[0]).toEqual({
      componentUid: '00000000-0000-4000-8000-0000000000aa',
      values: { name: 'Ann' },
      components: {
        deep: [
          {
            componentUid: '00000000-0000-4000-8000-0000000000bb',
            values: { x: 1 },
            components: {},
          },
        ],
      },
    });
    expect(JSON.stringify(tree)).not.toContain('"id"');
  });

  it('shares no mutable state with the source', () => {
    const tree = cloneTree(document);
    (tree.values as Record<string, unknown>).title = 'changed';
    const values = tree.components?.reference?.[0]?.values ?? {};
    values.name = 'changed';
    expect(document.values.title).toBe('A');
    expect(document.components.reference?.[0]?.values.name).toBe('Ann');
  });
});
