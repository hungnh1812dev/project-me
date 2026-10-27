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
