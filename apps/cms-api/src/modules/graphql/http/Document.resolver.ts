import { HttpStatus } from '@nestjs/common';
import type { GraphQLFieldResolver, GraphQLSchema } from 'graphql';

import { describeError } from '../../../common/http/describe-http-exception';
import { parseRequest } from '../../../common/http/request-parsing';
import { type ActorContext, type SerializedRecord } from '../../access';
import { DOCUMENT_ERROR_CODES } from '../../documents';
import type { DocumentPage, DocumentsQueryService } from '../../documents';
import {
  type RootFieldExtension,
  ROOT_FIELD_EXTENSION_KEY,
  ROOT_OPERATIONS,
} from '../application/Graphql.constants';
import { type ListArguments, toListQuery } from './ListArguments.rules';
import { documentIdSchema } from '../../../common/validation/SharedSchemas.rules';

/** What every resolver reads from the request: who is asking. */
export interface GraphqlContext {
  actor: ActorContext;
}

const NOT_FOUND_STATUS: number = HttpStatus.NOT_FOUND;

type RootResult = DocumentPage | SerializedRecord | null;
type RootArgs = ListArguments & { documentId?: string };

function isDocumentNotFound(error: unknown): boolean {
  const described = describeError(error);
  return (
    described.statusCode === NOT_FOUND_STATUS &&
    described.errorCode === DOCUMENT_ERROR_CODES.NOT_FOUND
  );
}

function resolverFor(
  documents: DocumentsQueryService,
  { slug, operation }: RootFieldExtension,
): GraphQLFieldResolver<
  unknown,
  GraphqlContext,
  RootArgs,
  Promise<RootResult>
> {
  switch (operation) {
    case ROOT_OPERATIONS.LIST:
      return (_source, args, { actor }) =>
        documents.list(actor, slug, toListQuery(args));
    case ROOT_OPERATIONS.SINGLE:
      return async (_source, args, { actor }) => {
        const page = await documents.list(
          actor,
          slug,
          toListQuery({
            ...args,
            page: 1,
            pageSize: 1,
            sort: null,
            filter: null,
          }),
        );
        return page.data[0] ?? null;
      };
    case ROOT_OPERATIONS.ITEM:
      return async (_source, args, { actor }) => {
        const documentId = parseRequest(documentIdSchema, args.documentId);
        try {
          return await documents.get(actor, slug, documentId, args.status);
        } catch (error) {
          // A missing row and a row the actor's conditions hide look the same.
          if (isDocumentNotFound(error)) return null;
          throw error;
        }
      };
  }
}

/**
 * Attaches the root resolvers to a built schema (SPEC D18). Each root field
 * names what it reads in `extensions.abyss`; the resolver converts the
 * arguments and calls `DocumentsQueryService` unchanged, the only data path.
 */
export function attachDocumentResolvers(
  schema: GraphQLSchema,
  documents: DocumentsQueryService,
): GraphQLSchema {
  const root = schema.getQueryType();
  if (root === undefined || root === null) return schema;
  for (const field of Object.values(root.getFields())) {
    const extension = field.extensions[ROOT_FIELD_EXTENSION_KEY] as
      RootFieldExtension | undefined;
    if (extension === undefined) continue;
    field.resolve = resolverFor(documents, extension) as GraphQLFieldResolver<
      unknown,
      GraphqlContext
    >;
  }
  return schema;
}
