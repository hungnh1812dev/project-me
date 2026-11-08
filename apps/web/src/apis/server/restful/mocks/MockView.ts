/** Mock answers by GraphQL operation name, then root field. Mock files hold plain data and import nothing. */
export type MockView = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export const MOCK_VIEW: MockView = {};
