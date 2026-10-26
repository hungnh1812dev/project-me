import { systemRole } from '../../../../test/fixtures/access.fixture';
import {
  FieldSelection,
  recordReadAccess,
  reviewerActor,
  SubjectCatalog,
} from '../../access';
import { ContentTypeRegistry } from '../../content-engine';
import { CONDITION_SYSTEM_FIELDS, joinFieldPath } from '../../access';
import { contentTypeView } from './ContentTypeView.rules';

const VOCABULARY = {
  systemConditionFields: CONDITION_SYSTEM_FIELDS,
  joinFieldPath,
};

/**
 * Contract guard for `GET /content-types` (the controller wraps these views
 * in `{ data }`). Frontends read these keys; removing or renaming one is a
 * breaking change. Adding a key is allowed: extend the lists on purpose.
 */
const CONTENT_TYPE_KEYS = ['draftAndPublish', 'fields', 'kind', 'slug'];
const FIELD_KEYS = [
  'component',
  'conditionKind',
  'path',
  'repeatable',
  'rootScalar',
  'sensitive',
  'system',
  'type',
];

const PROFILE = {
  slug: 'profile',
  kind: 'single',
  draftAndPublish: false,
  fields: [
    { name: 'email', type: 'string' },
    {
      name: 'experience',
      type: 'component',
      repeatable: true,
      fields: [{ name: 'company', type: 'string' }],
    },
  ],
} as const;

const registry = ContentTypeRegistry.fromDefinitions([PROFILE]);
const view = contentTypeView(
  registry.resolve(PROFILE.slug),
  new SubjectCatalog(registry),
  recordReadAccess(
    reviewerActor(1, 1, systemRole('reviewer')),
    FieldSelection.ALL,
  ),
  VOCABULARY,
);

describe('GET /content-types contract', () => {
  it('keeps the keys of a content type', () => {
    expect(Object.keys(view).sort()).toEqual(CONTENT_TYPE_KEYS);
  });

  it('keeps the same keys on content fields and system fields', () => {
    const content = view.fields.find((f) => !f.system);
    const system = view.fields.find((f) => f.system);
    expect(content).toBeDefined();
    expect(system).toBeDefined();
    expect(Object.keys(content!).sort()).toEqual(FIELD_KEYS);
    expect(Object.keys(system!).sort()).toEqual(FIELD_KEYS);
  });
});
