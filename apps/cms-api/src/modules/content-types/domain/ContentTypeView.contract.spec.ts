import { systemRole } from '../../../../test/fixtures/Access.fixture';
import {
  CONDITION_SYSTEM_FIELDS,
  FieldSelection,
  joinFieldPath,
  recordReadAccess,
  reviewerActor,
  SubjectCatalog,
} from '../../access';
import { ContentTypeRegistry, DEFAULT_FIELD_WIDTH } from '../../content-engine';
import { contentTypeView, type ViewVocabulary } from './ContentTypeView.rules';

const VOCABULARY: ViewVocabulary = {
  systemConditionFields: CONDITION_SYSTEM_FIELDS,
  joinFieldPath,
  defaultFieldWidth: DEFAULT_FIELD_WIDTH,
};

/**
 * Contract guard for `GET /content-types` (the controller wraps these views
 * in `{ data }`). Frontends read these keys; removing or renaming one is a
 * breaking change. Adding a key is allowed: extend the lists on purpose.
 */
const CONTENT_TYPE_KEYS = ['displayName', 'draftAndPublish', 'fields', 'kind', 'slug'];
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
  displayName: 'Profile',
  kind: 'single',
  draftAndPublish: false,
  fields: [
    { name: 'email', type: 'string' },
    { name: 'phone', type: 'string', width: '1/2', displayName: 'Phone number' },
    {
      name: 'experience',
      type: 'component',
      component: 'experience',
      repeatable: true,
      fields: [{ name: 'company', type: 'string' }],
    },
  ],
} as const;

const registry = ContentTypeRegistry.fromDefinitions([PROFILE]);
const view = contentTypeView(
  registry.resolve(PROFILE.slug),
  new SubjectCatalog(registry),
  recordReadAccess(reviewerActor(1, 1, systemRole('reviewer')), FieldSelection.ALL),
  VOCABULARY,
);

describe('GET /content-types contract', () => {
  it('adds displayName and width on content fields and nothing else', () => {
    const phone = view.fields.find((f) => f.path === 'phone')!;
    expect(Object.keys(phone).sort()).toEqual([...FIELD_KEYS, 'displayName', 'width'].sort());
  });

  it('keeps the keys of a content type', () => {
    expect(Object.keys(view).sort()).toEqual(CONTENT_TYPE_KEYS);
  });

  it('keeps the same keys on content fields and system fields', () => {
    const content = view.fields.find((f) => !f.system);
    const system = view.fields.find((f) => f.system);
    expect(content).toBeDefined();
    expect(system).toBeDefined();
    expect(Object.keys(content!).sort()).toEqual([...FIELD_KEYS, 'width'].sort());
    expect(Object.keys(system!).sort()).toEqual(FIELD_KEYS);
  });
});
