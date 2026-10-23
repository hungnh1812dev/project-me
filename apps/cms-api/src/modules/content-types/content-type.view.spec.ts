import { systemRole } from '../../../test/fixtures/access.fixture';
import {
  reviewerActor,
  FieldSelection,
  recordReadAccess,
  SubjectCatalog,
} from '../access';
import { RegistryService } from '../content-engine/registry.service';
import { contentTypeView } from './content-type.view';

const PROFILE = {
  slug: 'profile',
  kind: 'single',
  draftAndPublish: false,
  fields: [
    { name: 'email', type: 'string', sensitive: true },
    {
      name: 'experience',
      type: 'component',
      repeatable: true,
      fields: [
        { name: 'company', type: 'string' },
        {
          name: 'role',
          type: 'component',
          repeatable: true,
          fields: [{ name: 'teamSize', type: 'integer' }],
        },
      ],
    },
  ],
} as const;

const registry = RegistryService.fromDefinitions([PROFILE]);
const catalog = new SubjectCatalog(registry);
const type = registry.resolve(PROFILE.slug);

describe('contentTypeView (T17b)', () => {
  it('lists nested paths depth-first with repeatable and sensitive flags', () => {
    const view = contentTypeView(
      type,
      catalog,
      recordReadAccess(
        reviewerActor(1, 1, systemRole('reviewer')),
        FieldSelection.ALL,
      ),
    );
    expect(view).toMatchObject({
      slug: 'profile',
      kind: 'single',
      draftAndPublish: false,
    });
    expect(
      view.fields.map((f) => [f.path, f.repeatable, f.sensitive, f.system]),
    ).toEqual([
      ['email', false, true, false],
      ['experience', true, false, false],
      ['experience.company', false, false, false],
      ['experience.role', true, false, false],
      ['experience.role.teamSize', false, false, false],
      // reviewers never see createdBy / updatedBy (T16)
      ['documentId', false, false, true],
    ]);
  });

  it('keeps a component that is only partly visible, without its other fields', () => {
    const view = contentTypeView(type, catalog, {
      fields: FieldSelection.of(['experience.role.teamSize']),
      systemFields: new Set(),
    });
    expect(view.fields.map((f) => f.path)).toEqual([
      'experience',
      'experience.role',
      'experience.role.teamSize',
    ]);
  });
});
