export interface PageCvSkill {
  level: string | null;
  skill: string | null;
}

export interface PageCvRole {
  position: string | null;
  period: string | null;
  teamSize: number | null;
  /** Free text: the projects of this role in the company, not a list of `PageCvProject`. */
  projects: string | null;
  techStacks: unknown;
  responsibilities: string | null;
}

export interface PageCvExperience {
  company: string | null;
  location: string | null;
  period: string | null;
  roles: PageCvRole[] | null;
}

export interface PageCvProject {
  name: string | null;
  teamSize: number | null;
  role: string | null;
  liveLink: string | null;
  repositoryLink: string | null;
  techStack: unknown;
  responsibilities: string | null;
}

export interface PageCvEducation {
  degree: string | null;
  institution: string | null;
  period: string | null;
  location: string | null;
}

export interface PageCvA {
  documentId: string;
  name: string | null;
  position: string | null;
  summary: string | null;
  skills: PageCvSkill[] | null;
  experiences: PageCvExperience[] | null;
  projects: PageCvProject[] | null;
  educations: PageCvEducation[] | null;
  _maskedFields: string[];
}

export interface Profile {
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
  github: string | null;
  avatar: { url: string | null; alt: string | null } | null;
  _maskedFields: string[];
}

/** The labels shared by every CV; `noCvText` is richtext, the other fields plain text. */
export interface CvCommonText {
  summary: string | null;
  skills: string | null;
  experiences: string | null;
  projects: string | null;
  educations: string | null;
  technologies: string | null;
  teamSize: string | null;
  noCvText: string | null;
}

/** What a visitor session reads: data only, no text. */
export interface PageCvData {
  pageCvAList: { data: PageCvA[] };
  profile: Profile | null;
}

const PAGE_CV_A_FIELD = `pageCvAList(
    filter: { isMain: { eq: true } }
    sort: [{ field: updatedAt, direction: DESC }]
    pageSize: 1
  ) {
    data {
      documentId
      name
      position
      summary
      skills {
        skill
        level
      }
      experiences {
        company
        location
        period
        roles {
          position
          period
          teamSize
          projects
          techStacks
          responsibilities
        }
      }
      projects {
        name
        teamSize
        role
        liveLink
        repositoryLink
        techStack
        responsibilities
      }
      educations {
        degree
        institution
        period
        location
      }
      _maskedFields
    }
  }`;

const PROFILE_FIELD = `profile {
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
  }`;

const CV_COMMON_TEXT_FIELD = `cvCommonText {
    summary
    skills
    experiences
    projects
    educations
    technologies
    teamSize
    noCvText
  }`;

/** The newest published main CV. */
export const PAGE_CV_A_QUERY = `query PageCvA {\n  ${PAGE_CV_A_FIELD}\n}`;

export const PROFILE_QUERY = `query Profile {\n  ${PROFILE_FIELD}\n}`;

/** The labels shared by every CV. */
export const CV_COMMON_TEXT_QUERY = `query CvCommonText {\n  ${CV_COMMON_TEXT_FIELD}\n}`;

/** The data of a signed-in visitor: the main CV and the profile in one operation, without the text. */
export const PAGE_CV_VISITOR_QUERY = `query PageCvVisitor {\n  ${PAGE_CV_A_FIELD}\n  ${PROFILE_FIELD}\n}`;

export function mainCvOf(data: PageCvData): PageCvA | undefined {
  return data.pageCvAList.data[0];
}

/** True when the API masked this field path (`experiences.company`) for the viewer. */
export function isMaskedField(
  { _maskedFields: maskedFields }: Pick<PageCvA | Profile, '_maskedFields'>,
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
export function sanitizeCvRichtext(data: PageCvData, sanitize: RichtextSanitizer): PageCvData {
  return {
    ...data,
    pageCvAList: {
      data: data.pageCvAList.data.map((cv) => ({
        ...cv,
        summary: sanitizedOrNull(cv.summary, sanitize),
        experiences:
          cv.experiences?.map((experience) => ({
            ...experience,
            roles:
              experience.roles?.map((role) => ({
                ...role,
                responsibilities: sanitizedOrNull(role.responsibilities, sanitize),
              })) ?? null,
          })) ?? null,
        projects:
          cv.projects?.map((project) => ({
            ...project,
            responsibilities: sanitizedOrNull(project.responsibilities, sanitize),
          })) ?? null,
      })),
    },
  };
}
