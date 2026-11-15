export interface NotFoundText {
  notFoundTitle: string;
  notFoundDescription: string;
}

export interface NotFoundPage {
  notFoundText: NotFoundText;
}

export const NOT_FOUND_PAGE_OPERATION_NAME = 'NotFoundPage';

/** The not-found page text; `notFoundText` is a GraphQL alias of the cms-api root field `siteText`. */
export const NOT_FOUND_PAGE_ROOT_FIELDS = {
  notFoundText: `: siteText {
    notFoundTitle
    notFoundDescription
  }`,
} as const;
