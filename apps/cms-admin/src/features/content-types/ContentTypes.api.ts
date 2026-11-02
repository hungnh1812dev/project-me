import { API_ENDPOINTS } from '@configs/Api.endpoints';
import type { AxiosInstance } from 'axios';

/** A field of a content type. */
export interface ContentTypeField {
  path: string;
  type: string;
  system: boolean;
  component: boolean;
  repeatable: boolean;
  rootScalar: boolean;
  conditionKind: string | null;
  sensitive: boolean;
}

export interface ContentType {
  slug: string;
  displayName: string;
  kind: string;
  draftAndPublish: boolean;
  fields: ContentTypeField[];
}

/** Content-type discovery, sorted by slug. */
export async function getContentTypes(client: AxiosInstance): Promise<ContentType[]> {
  const { data } = await client.get<{ data: ContentType[] }>(API_ENDPOINTS.CONTENT_TYPES.LIST);
  return data.data;
}
