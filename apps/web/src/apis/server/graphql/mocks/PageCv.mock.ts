/** Mock answer of the `PageCv` operation: a sample main CV, the profile and the text the page showed before it came from the API. */
export const PAGE_CV_MOCK = {
  pageCvAList: {
    data: [
      {
        documentId: 'mock-page-cv',
        name: 'Mai Tran',
        position: 'Platform engineer',
        summary: '<p>Builds calm, observable systems for small teams.</p>',
        skills: [{ skill: 'TypeScript', level: 'Expert' }],
        experiences: [
          {
            company: 'Northwind Labs',
            location: 'Hanoi',
            period: '2020 - 2024',
            roles: [
              {
                position: 'Tech lead',
                period: '2022 - 2024',
                teamSize: 6,
                projects: 'Billing core, internal developer portal',
                techStacks: ['Node.js', 'PostgreSQL'],
                responsibilities: '<p>Led the platform team.</p>',
              },
            ],
          },
        ],
        projects: [
          {
            name: 'Billing core',
            teamSize: 4,
            role: 'Owner',
            liveLink: 'https://billing.example.com',
            repositoryLink: 'https://git.example.com/billing-core',
            techStack: ['NestJS'],
            responsibilities: '<p>Designed the invoicing model.</p>',
          },
        ],
        educations: [
          {
            degree: 'BSc Computer Science',
            institution: 'Example University',
            period: '2016 - 2020',
            location: 'Hanoi',
          },
          {
            degree: 'MSc Software Engineering',
            institution: 'Example Institute',
            period: '2020 - 2022',
            location: null,
          },
        ],
        _maskedFields: ['experiences.company'],
      },
    ],
  },
  profile: {
    name: 'Mai Tran',
    address: '12 Example Street, Hanoi',
    phone: '+84 555 0100',
    email: 'mai@example.com',
    linkedin: 'https://www.linkedin.com/in/mai-example',
    github: 'https://github.com/mai-example',
    avatar: { url: null, alt: null },
    _maskedFields: [],
  },
  pageCvText: {
    loading: 'Loading the CV',
    refetchFailed: 'The CV could not be loaded for your session. Reload the page to try again.',
    fallbackName: 'Curriculum vitae',
    maskedValue: 'Sign in to view',
    contact: {
      title: 'Contact',
      email: 'Email',
      phone: 'Phone',
      address: 'Address',
      linkedin: 'LinkedIn',
      github: 'GitHub',
    },
    sections: {
      summary: 'Summary',
      skills: 'Skills',
      experiences: 'Experience',
      projects: 'Projects',
      educations: 'Education',
    },
    role: {
      teamSize: 'Team of {size}',
      projects: 'Projects',
      techStack: 'Tech stack',
    },
    project: {
      teamSize: 'Team of {size}',
      techStack: 'Tech stack',
      liveLink: 'Live site',
      repositoryLink: 'Repository',
      liveLinkName: 'Live site of {project}',
      repositoryLinkName: 'Repository of {project}',
      unnamedProject: 'Project',
    },
  },
};
