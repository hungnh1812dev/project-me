import type { ConflictDetails, ConflictItem } from './conflict';

export const UID_A = '00000000-0000-4000-8000-00000000000a';
export const UID_B = '00000000-0000-4000-8000-00000000000b';
export const UID_C = '00000000-0000-4000-8000-00000000000c';

export const item = (
  componentUid: string,
  values: Record<string, unknown>,
): ConflictItem => ({ componentUid, values, components: {} });

/**
 * Saved version: position "Lead", company "Acme", skills A(React) B(Go)
 * C(Rust). The user edited position, company, skill A's level, removed B and
 * added a skill; `company` is masked for the role.
 */
export function conflictDetails(): ConflictDetails {
  return {
    currentVersion: 5,
    server: {
      values: { position: 'Lead', company: '***', summary: '<p>x</p>' },
      components: {
        skill: [
          item(UID_A, { skill: 'React', level: 'Senior' }),
          item(UID_B, { skill: 'Go', level: 'Mid' }),
          item(UID_C, { skill: 'Rust', level: 'Junior' }),
        ],
      },
      _maskedFields: ['company'],
    },
    submitted: {
      values: { position: 'Engineer', company: '***', summary: '<p>x</p>' },
      components: {
        skill: [
          item(UID_A, { skill: 'React', level: 'Lead' }),
          item(UID_C, { skill: 'Rust', level: 'Junior' }),
          item('', { skill: 'Zig', level: 'Junior' }),
        ],
      },
      _maskedFields: ['company'],
    },
    diff: [
      {
        path: 'values.position',
        change: 'changed',
        server: 'Lead',
        submitted: 'Engineer',
      },
      {
        path: 'values.company',
        change: 'changed',
        server: '***',
        submitted: 'Initech',
      },
      {
        path: `components.skill[${UID_A}].values.level`,
        change: 'changed',
        server: 'Senior',
        submitted: 'Lead',
      },
      {
        path: `components.skill[${UID_B}]`,
        change: 'removed',
        server: item(UID_B, { skill: 'Go', level: 'Mid' }),
      },
      {
        path: 'components.skill[new#2]',
        change: 'added',
        submitted: item('', { skill: 'Zig', level: 'Junior' }),
      },
    ],
  };
}
