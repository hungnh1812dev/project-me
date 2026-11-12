/** Text of the status page and its card; each state has its own key. */
export interface StatusPageText {
  title: string;
  description: string;
  cardTitle: string;
  cardDescription: string;
  endpointLabel: string;
  lastCheckedLabel: string;
  notCheckedYet: string;
  stateChecking: string;
  stateOk: string;
  stateError: string;
  errorHint: string;
  checkAgain: string;
}

export interface StatusPage {
  statusPageText: StatusPageText;
}

export const STATUS_PAGE_OPERATION_NAME = 'StatusPage';

/** The status page text: each root field's text after its name; `statusPageText` is a GraphQL alias of the cms-api root field `modulePageStatus`. */
export const STATUS_PAGE_ROOT_FIELDS = {
  statusPageText: `: modulePageStatus {
    title
    description
    cardTitle
    cardDescription
    endpointLabel
    lastCheckedLabel
    notCheckedYet
    stateChecking
    stateOk
    stateError
    errorHint
    checkAgain
  }`,
} as const;
