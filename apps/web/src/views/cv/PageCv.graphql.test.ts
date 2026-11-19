import { describeContentQueryContract } from '@/apis/server/graphql/ContentQuery.fixture';
import { MOCK_VIEW } from '@/apis/server/graphql/mocks/MockView';
import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';

import { parseCvDocumentId } from './PageCv.data';
import {
  CV_COMMON_TEXT_QUERY,
  PAGE_CV_A_QUERY,
  PAGE_CV_VISITOR_QUERY,
  PROFILE_QUERY,
  sanitizeCvRichtext,
  type PageCvData,
} from './PageCv.graphql';

describeContentQueryContract({ query: PAGE_CV_A_QUERY, mockKey: 'page-cv-a', mockView: MOCK_VIEW });
describeContentQueryContract({ query: PROFILE_QUERY, mockKey: 'profile', mockView: MOCK_VIEW });
describeContentQueryContract({
  query: CV_COMMON_TEXT_QUERY,
  mockKey: 'cv-common-text',
  mockView: MOCK_VIEW,
});
describeContentQueryContract({ query: PAGE_CV_VISITOR_QUERY, mockView: MOCK_VIEW });

describe('the PageCv operations', () => {
  it('asks one CV by the documentId variable, with no main filter or list', () => {
    expect(PAGE_CV_A_QUERY).toContain('query PageCvA($documentId: ID!)');
    expect(PAGE_CV_A_QUERY).toContain('pageCvA(documentId: $documentId)');
    expect(PAGE_CV_A_QUERY).not.toMatch(/is[M]ain|pageCvA[L]ist/);
  });

  it('gives the visitor the CV and the profile selections, without the text', () => {
    expect(PAGE_CV_VISITOR_QUERY).toContain('query PageCvVisitor($documentId: ID!)');
    expect(PAGE_CV_VISITOR_QUERY).toContain('pageCvA(documentId: $documentId)');
    expect(PAGE_CV_VISITOR_QUERY).toContain('profile {');
    expect(PAGE_CV_VISITOR_QUERY).not.toContain('cvCommonText');
  });

  it('gives the mock a fixed made-up UUID', () => {
    expect(parseCvDocumentId(PAGE_CV_MOCK.pageCvA.documentId)).not.toBeNull();
  });

  it('masks the company in the mock so the masked rendering shows', () => {
    expect(PAGE_CV_MOCK.pageCvA['_maskedFields']).toContain('experiences.company');
  });
});

describe('sanitizeCvRichtext', () => {
  const upper = (html: string) => html.toUpperCase();
  const data: PageCvData = {
    pageCvA: {
      documentId: 'c1',
      name: null,
      position: null,
      summary: 'summary',
      skills: null,
      experiences: [
        {
          company: 'kept',
          location: null,
          period: null,
          roles: [
            {
              position: null,
              period: null,
              teamSize: null,
              projects: 'plain',
              techStacks: null,
              responsibilities: 'role',
            },
          ],
        },
      ],
      projects: [
        {
          name: 'kept',
          teamSize: null,
          role: null,
          liveLink: null,
          repositoryLink: null,
          techStack: null,
          responsibilities: 'project',
        },
      ],
      educations: null,
      languages: null,
      references: null,
      _maskedFields: [],
    },
    profile: null,
  };

  it('sanitizes the summary, role responsibilities and project responsibilities only', () => {
    const { pageCvA: cv } = sanitizeCvRichtext(data, upper);
    expect(cv.summary).toBe('SUMMARY');
    expect(cv.experiences?.[0]?.roles?.[0]?.responsibilities).toBe('ROLE');
    expect(cv.experiences?.[0]?.roles?.[0]?.projects).toBe('plain');
    expect(cv.experiences?.[0]?.company).toBe('kept');
    expect(cv.projects?.[0]?.responsibilities).toBe('PROJECT');
    expect(cv.projects?.[0]?.name).toBe('kept');
  });

  it('turns a non-string richtext into null', () => {
    const { pageCvA: cv } = sanitizeCvRichtext(
      { ...data, pageCvA: { ...data.pageCvA, summary: null } },
      upper,
    );
    expect(cv.summary).toBeNull();
  });
});
