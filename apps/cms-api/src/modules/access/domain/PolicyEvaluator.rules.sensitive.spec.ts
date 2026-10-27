import {
  customRole,
  grant,
  systemRole,
} from '../../../../test/fixtures/Access.fixture';
import { PermissionAction } from '../../../generated/prisma/client';
import {
  ContentTypeRegistry,
  type ContentTypeDefinition,
} from '../../content-engine';
import {
  accountActor,
  anonymousActor,
  apiTokenActor,
  reviewerActor,
} from './ActorContext.entity';
import { nonSensitiveFieldList } from './FieldPaths.rules';
import { PolicyEvaluator } from './PolicyEvaluator.rules';
import { REVIEWER_ROLE_SLUG } from './SystemRoles.entity';
import { SubjectCatalog } from './SubjectCatalog.rules';

const { read } = PermissionAction;

const CONTACT: ContentTypeDefinition = {
  slug: 'contact',
  kind: 'single',
  draftAndPublish: true,
  fields: [
    { name: 'name', type: 'string' },
    { name: 'phone', type: 'string', sensitive: true },
    {
      name: 'referees',
      type: 'component',
      repeatable: true,
      fields: [
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string', sensitive: true },
      ],
    },
    {
      name: 'jobs',
      type: 'component',
      repeatable: true,
      fields: [{ name: 'title', type: 'string' }],
    },
  ],
};

const PLAIN: ContentTypeDefinition = {
  slug: 'plain',
  kind: 'collection',
  draftAndPublish: false,
  fields: [{ name: 'text', type: 'text' }],
};

const evaluator = new PolicyEvaluator(
  new SubjectCatalog(ContentTypeRegistry.fromDefinitions([CONTACT, PLAIN])),
);

const EXPECTED_VISIBLE = ['name', 'referees.name', 'jobs'];

function readableOf(actor: Parameters<typeof evaluator.fieldsFor>[0]) {
  return evaluator.fieldsFor(actor, CONTACT.slug).readable;
}

describe('nonSensitiveFieldList', () => {
  it('lists every field but the sensitive ones, splitting a component that holds one', () => {
    expect(nonSensitiveFieldList(CONTACT)).toEqual(EXPECTED_VISIBLE);
  });

  it('is null when the type has no sensitive field', () => {
    expect(nonSensitiveFieldList(PLAIN)).toBeNull();
  });
});

describe('sensitive fields and the wildcard grant (SPEC D2)', () => {
  it.each([
    ['anonymous (public role)', anonymousActor(systemRole('public'))],
    ['reviewer', reviewerActor(1, 2, systemRole('reviewer'))],
  ])('masks them for %s', (_label, actor) => {
    const readable = readableOf(actor);
    expect(readable.allows('name')).toBe(true);
    expect(readable.allows('referees.name')).toBe(true);
    expect(readable.allows('jobs.title')).toBe(true);
    expect(readable.allows('phone')).toBe(false);
    expect(readable.allows('referees.phone')).toBe(false);
    expect(readable.reaches('referees')).toBe(true);
  });

  it('keeps a type without sensitive fields fully readable', () => {
    const anonymous = anonymousActor(systemRole('public'));
    expect(
      evaluator.fieldsFor(anonymous, PLAIN.slug).readable.isUnrestricted,
    ).toBe(true);
  });

  it('leaves editor and owner unrestricted', () => {
    expect(
      readableOf(accountActor(1, systemRole('editor'))).allows('phone'),
    ).toBe(true);
    expect(
      readableOf(accountActor(1, systemRole('owner'))).allows('phone'),
    ).toBe(true);
  });

  it('lets a type-specific grant of the public role unmask a field', () => {
    const role = systemRole('public', [
      grant('*', read),
      grant(CONTACT.slug, read, { readableFields: ['name', 'phone'] }),
    ]);
    const readable = readableOf(anonymousActor(role));
    expect(readable.allows('phone')).toBe(true);
    expect(readable.allows('referees.name')).toBe(false);
  });

  it('lets an owner edit with a type-specific all-fields row unmask everything', () => {
    const role = systemRole('reviewer', [grant(CONTACT.slug, read)]);
    const readable = readableOf(reviewerActor(1, 2, role));
    expect(readable.isUnrestricted).toBe(true);
  });

  it('does not apply to a custom role that happens to be called like a masked one', () => {
    const role = {
      ...customRole(15, [grant('*', read)]),
      slug: REVIEWER_ROLE_SLUG,
    };
    expect(readableOf(accountActor(1, role)).allows('phone')).toBe(true);
  });

  it('leaves API token scopes unchanged', () => {
    const actor = apiTokenActor(1, 1, systemRole('editor'), {
      permissions: [{ subject: CONTACT.slug, action: read }],
    });
    expect(readableOf(actor).allows('phone')).toBe(true);
  });
});
