import { type AccessPolicyService, type ActorContext } from '../../access';
import type { IAppConfig } from '../../../config/app-config';
import {
  GraphqlExecutor,
  type GraphqlSchemaProvider,
} from './Graphql.executor';
import { buildGraphqlSchema } from './schema/SchemaBuilder.rules';

const schema = buildGraphqlSchema([
  {
    slug: 'article',
    kind: 'collection',
    draftAndPublish: true,
    fields: [{ name: 'title', type: 'string' }],
  },
]);
const actor = {} as ActorContext;

function executor(isProduction: boolean, canRead = true) {
  return new GraphqlExecutor(
    {
      schemaFor: () => Promise.resolve(schema),
    } as unknown as GraphqlSchemaProvider,
    {
      policy: () =>
        Promise.resolve({
          evaluator: { rowFilter: () => ({ allowed: canRead }) },
        }),
    } as unknown as AccessPolicyService,
    { isProduction } as IAppConfig,
  );
}
const messages = async (e: GraphqlExecutor, query: string) =>
  (await e.run(actor, { query }, 'rid')).body.errors?.map(
    (error) => error.message,
  );

describe('GraphqlExecutor', () => {
  it('allows introspection outside production, refuses it in production', async () => {
    const query = '{ __schema { queryType { name } } }';
    const dev = await executor(false).run(actor, { query }, 'rid');
    expect(dev.status).toBe(200);
    const prod = await executor(true).run(actor, { query }, 'rid');
    expect(prod.status).toBe(400);
    expect(prod.body.data).toBeUndefined();
    expect(prod.body.errors?.[0]?.extensions.code).toBe(
      'GRAPHQL_VALIDATION_FAILED',
    );
  });

  it('strips suggestions in production only', async () => {
    const query = '{ articleList { data { titl } } }';
    expect((await messages(executor(false), query))?.[0]).toContain(
      'Did you mean',
    );
    expect((await messages(executor(true), query))?.[0]).toBe(
      'Cannot query field "titl" on type "Article".',
    );
  });

  it('a hidden type is the same error as an unknown one, with no hint', async () => {
    const hidden = await messages(
      executor(false, false),
      '{ articleLis { meta { total } } }',
    );
    expect(hidden).toEqual([
      'Cannot query field "articleLis" on type "Query".',
    ]);
  });

  it('stops parsing a document over the token limit', async () => {
    const query = `{ ${'articleList '.repeat(2_100)} }`;
    const result = await executor(false).run(actor, { query }, 'rid');
    expect(result.status).toBe(400);
    expect(result.body.errors?.[0]?.extensions.code).toBe(
      'GRAPHQL_LIMIT_EXCEEDED',
    );
  });

  it('keeps a plain syntax error as GRAPHQL_PARSE_FAILED', async () => {
    const result = await executor(false).run(actor, { query: '{ ' }, 'rid');
    expect(result.status).toBe(400);
    expect(result.body.errors?.[0]?.extensions.code).toBe(
      'GRAPHQL_PARSE_FAILED',
    );
  });

  it('refuses an over-limit document before loading the policy or schema', async () => {
    const policy = jest.fn();
    const schemaFor = jest.fn();
    const guarded = new GraphqlExecutor(
      { schemaFor } as unknown as GraphqlSchemaProvider,
      { policy } as unknown as AccessPolicyService,
      { isProduction: false } as IAppConfig,
    );
    const query = `{ ${'a { '.repeat(9)}x${' }'.repeat(9)} }`;
    const result = await guarded.run(actor, { query }, 'rid');
    expect(result.status).toBe(400);
    expect(result.body.data).toBeUndefined();
    expect(result.body.errors?.[0]?.extensions.code).toBe(
      'GRAPHQL_LIMIT_EXCEEDED',
    );
    expect(policy).not.toHaveBeenCalled();
    expect(schemaFor).not.toHaveBeenCalled();
  });
});
