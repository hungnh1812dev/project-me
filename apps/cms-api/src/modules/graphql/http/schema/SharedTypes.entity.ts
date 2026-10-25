import {
  GraphQLEnumType,
  GraphQLID,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

import { CONTENT_STATUSES } from '../../../content-engine';
import { SHARED_TYPE_NAMES } from '../../application/Graphql.constants';
import { DateTimeScalar } from './Scalars.rules';

export const DocumentStatusEnum = new GraphQLEnumType({
  name: SHARED_TYPE_NAMES.DOCUMENT_STATUS,
  description: 'Which version of a document to read.',
  values: Object.fromEntries(
    CONTENT_STATUSES.map((status) => [status.toUpperCase(), { value: status }]),
  ),
});

export const SortDirectionEnum = new GraphQLEnumType({
  name: SHARED_TYPE_NAMES.SORT_DIRECTION,
  values: { ASC: { value: 'asc' }, DESC: { value: 'desc' } },
});

export const PageMetaType = new GraphQLObjectType({
  name: SHARED_TYPE_NAMES.PAGE_META,
  fields: {
    page: { type: new GraphQLNonNull(GraphQLInt) },
    pageSize: { type: new GraphQLNonNull(GraphQLInt) },
    total: { type: new GraphQLNonNull(GraphQLInt) },
  },
});

/** Mirrors the media embed of a document read; the internal id never appears. */
export const MediaType = new GraphQLObjectType({
  name: SHARED_TYPE_NAMES.MEDIA,
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
    fileName: { type: GraphQLString },
    url: { type: GraphQLString },
    thumbnailUrl: { type: GraphQLString },
    provider: { type: GraphQLString },
    alt: { type: GraphQLString },
    size: { type: GraphQLInt },
    createdAt: { type: DateTimeScalar },
  },
});
