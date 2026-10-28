import { fetchGraphql } from '../../lib/Graphql.server';
import { loadCvPage } from './CvPage.server';

vi.mock('../../lib/Graphql.server', () => ({
  fetchGraphql: vi.fn<typeof fetchGraphql>(),
}));

describe('loadCvPage', () => {
  it('sanitizes richtext on the server before it reaches the page', async () => {
    vi.mocked(fetchGraphql).mockResolvedValue({
      resumeList: {
        data: [
          {
            documentId: 'r1',
            summary: '<p>ok</p><script>steal()</script><img src=x onerror=x()>',
            experiences: [
              {
                roles: [
                  { responsibilities: '<a href="javascript:x()">go</a>' },
                ],
              },
            ],
          },
        ],
      },
      cvContact: null,
    });

    const [resume] = (await loadCvPage()).resumeList.data;

    expect(resume?.summary).toBe('<p>ok</p>');
    expect(resume?.experiences?.[0]?.roles?.[0]?.responsibilities).toBe(
      '<a>go</a>',
    );
  });
});
