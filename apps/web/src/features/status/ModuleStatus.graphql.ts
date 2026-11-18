/** Text of the module status and its card; each state has its own key. */
export interface ModuleStatusText {
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

export interface ModuleStatus {
  statusText: ModuleStatusText;
}

/** The module status text; `statusText` is a GraphQL alias of the cms-api root field `moduleStatus`. */
export const MODULE_STATUS_QUERY = `query ModuleStatus {
statusText: moduleStatus {
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
  }
}`;
