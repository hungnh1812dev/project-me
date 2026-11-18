export interface NotFoundText {
  notFoundTitle: string;
  notFoundDescription: string;
}

export interface NotFoundPage {
  notFoundText: NotFoundText;
}

/** The not-found page text; `notFoundText` is a GraphQL alias of the cms-api root field `header`. */
export const NOT_FOUND_PAGE_QUERY = `query NotFoundPage {
notFoundText: header {
    notFoundTitle
    notFoundDescription
  }
}`;
