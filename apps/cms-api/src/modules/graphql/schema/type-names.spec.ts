import {
  camelCase,
  componentTypeName,
  pascalCase,
  rootNamesOf,
} from './type-names';

describe('type names', () => {
  it('converts slugs and field names', () => {
    expect(pascalCase('cv-page')).toBe('CvPage');
    expect(camelCase('cv-page')).toBe('cvPage');
    expect(pascalCase('teamSize')).toBe('TeamSize');
    expect(pascalCase('team_size')).toBe('TeamSize');
    expect(pascalCase('a1-b2')).toBe('A1B2');
  });

  it('derives the type and root field names of a slug', () => {
    expect(rootNamesOf('cv-page')).toEqual({
      type: 'CvPage',
      page: 'CvPagePage',
      filter: 'CvPageFilter',
      sort: 'CvPageSort',
      sortField: 'CvPageSortField',
      itemField: 'cvPage',
      listField: 'cvPageList',
    });
  });

  it('joins component paths with underscores', () => {
    const experience = componentTypeName('CvPage', 'experience');
    expect(experience).toBe('CvPage_Experience');
    expect(componentTypeName(experience, 'role')).toBe(
      'CvPage_Experience_Role',
    );
  });
});
