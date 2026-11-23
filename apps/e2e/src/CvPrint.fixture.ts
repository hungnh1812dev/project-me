/** Data of a long CV and the CV labels, so the printed CV spans several A4 pages. No imports: usable from a plain Node script. */

export const CV_PRINT_LABEL = 'Print / Save as PDF';

export const CV_PRINT_SECRET_COMPANY_PREFIX = 'Print Secret Co';

export const CV_PRINT_SECRET_PHONE = '+1 555 0177';

export const CV_PRINT_SECRET_EMAIL = 'print-secret@example.com';

const COMPANY_COUNT = 3;
const ROLES_PER_COMPANY = 2;
const PROJECT_COUNT = 5;
const BULLETS_PER_ROLE = 4;
const SKILL_LEVELS = ['Proficient', 'Intermediate', 'Working Knowledge', 'Others'];
const SKILLS_PER_LEVEL = 6;

const bullets = (seed: string): string =>
  `<ul>${Array.from(
    { length: BULLETS_PER_ROLE },
    (_, index) =>
      `<li>${seed} point ${index + 1}: <strong>owned</strong> the delivery of a feature end to end, reviewed the work of the team and tuned the rendering strategy until the pages stayed fast under real traffic.</li>`,
  ).join('')}</ul>`;

export const commonTextValues = (): Record<string, string> => ({
  summary: 'About me',
  skills: 'Skills',
  experiences: 'Work experiences',
  projects: 'Projects',
  achievements: 'Achievements',
  educations: 'Educations',
  languages: 'Languages',
  reference: 'References',
  phone: 'Phone',
  technologies: 'Technologies',
  teamSize: 'Team of',
  webLink: 'Live',
  projectLink: 'Repository',
  print: CV_PRINT_LABEL,
  noCvText: '<p>No CV is live yet.</p>',
});

export const cvPayload = (
  name: string,
  position: string,
  secretCompany: string,
): { values: Record<string, unknown>; components: Record<string, unknown[]> } => ({
  values: {
    name,
    position,
    isMain: true,
    summary:
      '<p><strong>6 years</strong> building production frontend with <strong>React</strong> and <strong>TypeScript</strong>, apps used by millions, with a focus on rendering strategy, caching and mentoring.</p>',
  },
  components: {
    skills: SKILL_LEVELS.flatMap((level) =>
      Array.from({ length: SKILLS_PER_LEVEL }, (_, index) => ({
        values: { skill: `${level} skill ${index + 1}`, level },
      })),
    ),
    experiences: Array.from({ length: COMPANY_COUNT }, (_company, companyIndex) => ({
      values: {
        company: companyIndex === 0 ? secretCompany : `Company ${companyIndex + 1}`,
        location: 'Da Nang',
        period: `${2010 + companyIndex * 4} - ${2014 + companyIndex * 4}`,
      },
      components: {
        roles: Array.from({ length: ROLES_PER_COMPANY }, (_role, roleIndex) => ({
          values: {
            position: `Role ${companyIndex + 1}.${roleIndex + 1}`,
            period: `${2010 + companyIndex * 4 + roleIndex} - ${2012 + companyIndex * 4 + roleIndex}`,
            techStacks: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'GraphQL'],
            responsibilities: bullets(`Role ${companyIndex + 1}.${roleIndex + 1}`),
          },
        })),
      },
    })),
    projects: Array.from({ length: PROJECT_COUNT }, (_, index) => ({
      values: {
        name: `Project ${index + 1}`,
        teamSize: 3 + index,
        role: 'Frontend Developer',
        liveLink: `https://example.com/project-${index + 1}`,
        techStack: ['React', 'Next.js', 'TypeScript'],
        responsibilities: bullets(`Project ${index + 1}`),
      },
    })),
    educations: [
      {
        values: {
          degree: 'Bachelor of Software Engineering',
          institution: 'Example University',
          period: '2006 - 2010',
          location: 'Da Nang',
        },
      },
    ],
    languages: [
      { values: { language: 'English', level: 'Professional' } },
      { values: { language: 'Vietnamese', level: 'Native' } },
    ],
    references: [
      { values: { name: 'Reference One', role: 'Engineering Manager', phone: '+84 900 000 001' } },
      { values: { name: 'Reference Two', role: 'Tech Lead', phone: '+84 900 000 002' } },
    ],
  },
});
