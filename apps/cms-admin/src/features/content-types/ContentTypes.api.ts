import { API_ENDPOINTS } from '@configs/Api.endpoints';
import type { AxiosInstance } from 'axios';

/** Share of the admin form row a field takes. */
export type FieldWidth = '1/3' | '1/2' | 'full';

/** A field of a content type. */
export interface ContentTypeField {
  path: string;
  type: string;
  system: boolean;
  component: boolean;
  /** Admin label set in the definition; absent when none. */
  displayName?: string;
  /** Form row share; absent on components. */
  width?: FieldWidth;
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

/** `create` checks a new type; `update` leaves out the registered type with the same slug. */
export type DefinitionValidationMode = 'create' | 'update';

export interface DefinitionValidationRequest {
  definition: object;
  mode: DefinitionValidationMode;
}

/** One rule a definition breaks; `path` points into the submitted definition. */
export interface DefinitionError {
  path: (string | number)[];
  rule: string;
  message: string;
}

export interface DefinitionValidation {
  valid: boolean;
  errors: DefinitionError[];
}

export function createContentTypesApi(client: AxiosInstance) {
  return {
    /** Asks cms-api whether a candidate definition passes the content-engine validator. */
    validateDefinition: async (
      request: DefinitionValidationRequest,
    ): Promise<DefinitionValidation> => {
      const { data } = await client.post<DefinitionValidation>(
        API_ENDPOINTS.CONTENT_TYPES.VALIDATE,
        request,
      );
      return data;
    },
  };
}

export type ContentTypesApi = ReturnType<typeof createContentTypesApi>;
