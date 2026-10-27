import type { GraphqlDocument } from '../../lib/GraphqlResponse.rules';

export interface ResumeSkill {
  level: string | null;
  skill: string | null;
}

export interface ResumeProject {
  name: string | null;
  teamSize: number | null;
  role: string | null;
  liveLink: string | null;
  repositoryLink: string | null;
  techStack: unknown;
  responsibilities: string | null;
}

export interface ResumeRole {
  position: string | null;
  period: string | null;
  teamSize: number | null;
  projects: ResumeProject[] | null;
  techStack: unknown;
  responsibilities: string | null;
}

export interface ResumeExperience {
  company: string | null;
  location: string | null;
  period: string | null;
  roles: ResumeRole[] | null;
}

export interface ResumeEducation {
  degree: string | null;
  institution: string | null;
  period: string | null;
  location: string | null;
  description: string | null;
}

export interface ResumeLanguage {
  language: string | null;
  level: string | null;
}

export interface ResumeReferee {
  name: string | null;
  phone: string | null;
  role: string | null;
}

export interface Resume {
  documentId: string;
  position: string | null;
  name: string | null;
  summary: string | null;
  skills: ResumeSkill[] | null;
  experiences: ResumeExperience[] | null;
  educations: ResumeEducation[] | null;
  languages: ResumeLanguage[] | null;
  referees: ResumeReferee[] | null;
  _maskedFields: string[];
}

export interface CvContact {
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
  github: string | null;
  avatar: { url: string | null; alt: string | null } | null;
  _maskedFields: string[];
}

export interface CvPageData {
  resumeList: { data: Resume[] };
  cvContact: CvContact | null;
}

/** The newest published resume marked as main, with the contact card. */
export const CV_PAGE_DOCUMENT = {
  operationName: 'CvPage',
  query: /* GraphQL */ `
    query CvPage {
      resumeList(
        filter: { isMain: { eq: true } }
        sort: [{ field: updatedAt, direction: DESC }]
        pageSize: 1
      ) {
        data {
          documentId
          position
          name
          summary
          skills {
            level
            skill
          }
          experiences {
            company
            location
            period
            roles {
              position
              period
              teamSize
              techStack
              responsibilities
              projects {
                name
                teamSize
                role
                liveLink
                repositoryLink
                techStack
                responsibilities
              }
            }
          }
          educations {
            degree
            institution
            period
            location
            description
          }
          languages {
            language
            level
          }
          referees {
            name
            phone
            role
          }
          _maskedFields
        }
      }
      cvContact {
        name
        address
        phone
        email
        linkedin
        github
        avatar {
          url
          alt
        }
        _maskedFields
      }
    }
  `,
} as const satisfies GraphqlDocument;

export function mainResumeOf(data: CvPageData): Resume | undefined {
  return data.resumeList.data[0];
}

/** True when the API masked this field path (`referees.phone`) for the viewer. */
export function isMaskedField(
  { _maskedFields: maskedFields }: Pick<Resume | CvContact, '_maskedFields'>,
  path: string,
): boolean {
  return maskedFields.includes(path);
}

type RichtextSanitizer = (html: string) => string;

function sanitizedOrNull(
  value: string | null | undefined,
  sanitize: RichtextSanitizer,
): string | null {
  return typeof value === 'string' ? sanitize(value) : null;
}

/**
 * Returns the data with every richtext value sanitized. The components render
 * richtext with `dangerouslySetInnerHTML`, so each way data enters the page
 * (server load, browser refetch) must pass through here first; the sanitizer
 * is passed in because the server and the browser need different DOMs.
 */
export function sanitizeCvRichtext(
  data: CvPageData,
  sanitize: RichtextSanitizer,
): CvPageData {
  return {
    ...data,
    resumeList: {
      data: data.resumeList.data.map((resume) => ({
        ...resume,
        summary: sanitizedOrNull(resume.summary, sanitize),
        experiences:
          resume.experiences?.map((experience) => ({
            ...experience,
            roles:
              experience.roles?.map((role) => ({
                ...role,
                responsibilities: sanitizedOrNull(
                  role.responsibilities,
                  sanitize,
                ),
                projects:
                  role.projects?.map((project) => ({
                    ...project,
                    responsibilities: sanitizedOrNull(
                      project.responsibilities,
                      sanitize,
                    ),
                  })) ?? null,
              })) ?? null,
          })) ?? null,
        educations:
          resume.educations?.map((education) => ({
            ...education,
            description: sanitizedOrNull(education.description, sanitize),
          })) ?? null,
      })),
    },
  };
}
