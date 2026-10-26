import { mediaFieldNamesByTable, RegistryService } from '../../content-engine';
import { cloneTree, mediaSlots, type TreeNodeLike } from './MediaSlots.rules';

const GALLERY = {
  slug: 'gallery',
  kind: 'collection',
  draftAndPublish: false,
  fields: [
    { name: 'cover', type: 'media' },
    {
      name: 'block',
      type: 'component',
      repeatable: true,
      fields: [{ name: 'image', type: 'media' }],
    },
  ],
} as const;

function tree(): TreeNodeLike {
  return {
    values: { cover: 'a' },
    components: { block: [{ values: { image: 'b' } }, { values: {} }] },
  };
}

describe('mediaSlots', () => {
  const registry = RegistryService.fromDefinitions([GALLERY]);

  it('lists every media value with its input path', () => {
    const paths = mediaSlots(
      mediaFieldNamesByTable(registry),
      registry.resolve('gallery').root,
      tree(),
      '',
    ).map((slot) => slot.path);
    expect(paths).toEqual(['values.cover', 'components.block[0].values.image']);
  });
});

describe('cloneTree', () => {
  it('copies the values objects so a write leaves the input alone', () => {
    const original = tree();
    const copy = cloneTree(original);
    if (copy.values) copy.values['cover'] = 'changed';
    expect(original.values?.['cover']).toBe('a');
    expect(copy.components?.['block']?.[0]).not.toBe(
      original.components?.['block']?.[0],
    );
  });
});
