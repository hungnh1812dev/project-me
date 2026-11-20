export interface NotFoundText {
  title: string;
  description: string;
}

export interface NotFoundPage {
  notFoundText: NotFoundText;
}

/** The not-found page text; `notFoundText` is a GraphQL alias of the cms-api root field `moduleNotFound`. */
export const NOT_FOUND_PAGE_QUERY = `query NotFoundPage {
notFoundText: moduleNotFound {
    title
    description
  }
}`;
