/** Mock answer of the `CvPage` operation: a sample main CV, its contact card and the text the page showed before it came from the API. */
export const CV_PAGE_MOCK = {
  cvPageList: {
    data: [
      {
        documentId: 'mock-cv-page',
        position: 'Platform engineer',
        name: 'Mai Tran',
        summary: '<p>Builds calm, observable systems for small teams.</p>',
        skills: [{ level: 'Expert', skill: 'TypeScript' }],
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
                techStack: ['Node.js', 'PostgreSQL'],
                responsibilities: '<p>Led the platform team.</p>',
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
              },
            ],
          },
        ],
        educations: [
          {
            degree: 'BSc Computer Science',
            institution: 'Example University',
            period: '2016 - 2020',
            location: 'Hanoi',
            description: '<p>Graduated with honours.</p>',
          },
        ],
        languages: [{ language: 'English', level: 'Fluent' }],
        references: [{ name: 'Linh Pham', phone: '+84 555 0100', role: 'Director' }],
        _maskedFields: ['references.phone', 'experiences.company'],
      },
    ],
  },
  cvContact: {
    name: 'Mai Tran',
    address: '12 Example Street, Hanoi',
    phone: '+84 555 0100',
    email: 'mai@example.com',
    linkedin: 'https://www.linkedin.com/in/mai-example',
    github: 'https://github.com/mai-example',
    avatar: { url: null, alt: null },
    _maskedFields: [],
  },
  cvPageText: {
    loading: 'Loading the CV',
    refetchFailed: 'The CV could not be loaded for your session. Reload the page to try again.',
    fallbackName: 'Curriculum vitae',
    emptyTitle: 'No CV published yet',
    emptyDescription: 'The owner has not published a main resume. Check back later.',
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
      educations: 'Education',
      languages: 'Languages',
      references: 'References',
    },
    experience: {
      teamSize: 'Team of {size}',
      projects: 'Projects',
      techStack: 'Tech stack',
      liveLink: 'Live site',
      repositoryLink: 'Repository',
      liveLinkName: 'Live site of {project}',
      repositoryLinkName: 'Repository of {project}',
      unnamedProject: 'Project',
    },
    reference: {
      phone: 'Phone',
    },
  },
};
