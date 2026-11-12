import type { ContentRegistry, ContentTypeDefinition } from '../../content-engine';
import {
  DEFINITION_VALIDATION_MODES,
  DefinitionValidationService,
} from './DefinitionValidation.service';

function definitionOf(slug: string): ContentTypeDefinition {
  return {
    slug,
    displayName: slug,
    kind: 'collection',
    draftAndPublish: false,
    fields: [{ name: 'title', type: 'string' }],
  };
}

const asCandidate = (definition: ContentTypeDefinition): Record<string, unknown> => ({
  ...definition,
});

function serviceWith(registry: () => Promise<{ definitions(): ContentTypeDefinition[] }>) {
  return new DefinitionValidationService({ registry } as unknown as ContentRegistry);
}

describe('DefinitionValidationService', () => {
  const registered = [definitionOf('article'), definitionOf('news')];
  const service = serviceWith(() => Promise.resolve({ definitions: () => registered }));

  it('reports a clash with a registered slug in create mode', async () => {
    const result = await service.validate({
      definition: asCandidate(definitionOf('article')),
      mode: DEFINITION_VALIDATION_MODES.CREATE,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('leaves out the same slug in update mode', async () => {
    const result = await service.validate({
      definition: asCandidate(definitionOf('article')),
      mode: DEFINITION_VALIDATION_MODES.UPDATE,
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rethrows a registry failure instead of answering valid', async () => {
    const failure = new Error('registry down');
    await expect(
      serviceWith(() => Promise.reject(failure)).validate({
        definition: asCandidate(definitionOf('x')),
        mode: DEFINITION_VALIDATION_MODES.CREATE,
      }),
    ).rejects.toBe(failure);
  });
});
