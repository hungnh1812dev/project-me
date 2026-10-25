import type {
  ComponentInput,
  ComponentsInput,
  ComponentTrees,
  ContentDocument,
  TreeInput,
} from '../../content-engine';

function cloneComponents(trees: ComponentTrees): ComponentsInput {
  const clonedComponents: ComponentsInput = {};
  for (const [field, nodes] of Object.entries(trees)) {
    clonedComponents[field] = nodes.map((node): ComponentInput => ({
      componentUid: node.componentUid,
      values: { ...node.values },
      components: cloneComponents(node.components),
    }));
  }
  return clonedComponents;
}

/**
 * A stored document as a `TreeInput` the repository can insert again
 * (publish: draft -> published). Component uids are kept so a diff can match
 * the two copies; row ids are not part of the input, so the copy shares no
 * rows with the original.
 */
export function cloneTree(document: ContentDocument): TreeInput {
  return {
    values: { ...document.values },
    components: cloneComponents(document.components),
  };
}
