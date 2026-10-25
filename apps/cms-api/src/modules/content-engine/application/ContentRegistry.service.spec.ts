import type { AppLogger } from '../../../infrastructure/logging/AppLogger.port';
import { ContentTypeRegistry } from '../domain/ContentTypeRegistry.entity';
import { ContentRegistry } from './ContentRegistry.service';
import type {
  ContentTypeRepository,
  StoredContentTypes,
} from './ContentTypeRepository.port';

const NOTE = {
  slug: 'note',
  kind: 'collection',
  draftAndPublish: false,
  fields: [{ name: 'title', type: 'string' }],
};

class FakeContentTypeRepository implements ContentTypeRepository {
  calls = 0;

  constructor(private readonly outcomes: (StoredContentTypes | Error)[]) {}

  loadDefinitions(): Promise<StoredContentTypes> {
    const outcome = this.outcomes[this.calls++] ?? this.outcomes.at(-1);
    return outcome instanceof Error
      ? Promise.reject(outcome)
      : Promise.resolve(outcome as StoredContentTypes);
  }
}

const loaded: StoredContentTypes = {
  status: 'loaded',
  definitions: [NOTE],
};

function build(outcomes: (StoredContentTypes | Error)[]) {
  const repository = new FakeContentTypeRepository(outcomes);
  const warn = jest.fn();
  const logger: AppLogger = { warn, error: jest.fn() };
  return {
    repository,
    warn,
    registry: new ContentRegistry(repository, logger),
  };
}

describe('ContentRegistry', () => {
  it('builds the registry from the stored definitions', async () => {
    const { registry } = build([loaded]);
    const types = await registry.registry();
    expect(types).toBeInstanceOf(ContentTypeRegistry);
    expect(types.slugs()).toEqual(['note']);
  });

  it('loads once and keeps the registry for the process lifetime', async () => {
    const { registry, repository } = build([loaded]);
    const first = await registry.registry();
    const second = await registry.registry();
    expect(second).toBe(first);
    expect(repository.calls).toBe(1);
  });

  it('shares one load between concurrent callers', async () => {
    const { registry, repository } = build([loaded]);
    await Promise.all([registry.registry(), registry.registry()]);
    expect(repository.calls).toBe(1);
  });

  it('is empty and warns when content:migrate never ran', async () => {
    const { registry, warn } = build([{ status: 'not-migrated' }]);
    const types = await registry.registry();
    expect(types.slugs()).toEqual([]);
    expect(types.slugs()).not.toContain('note');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('run content:migrate'),
      'ContentRegistry',
    );
  });

  it('retries after a failed load', async () => {
    const { registry, repository } = build([new Error('db down'), loaded]);
    await expect(registry.registry()).rejects.toThrow('db down');
    const types = await registry.registry();
    expect(types.slugs()).toEqual(['note']);
    expect(repository.calls).toBe(2);
  });

  it('rejects stored definitions that fail validation', async () => {
    const { registry } = build([
      { status: 'loaded', definitions: [{ ...NOTE, slug: 'Bad Slug' }] },
    ]);
    await expect(registry.registry()).rejects.toThrow(/invalid definition/);
  });
});
