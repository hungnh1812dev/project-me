import { Injectable } from '@nestjs/common';

import {
  ContentRegistry,
  validateCandidateDefinition,
  type DefinitionValidationError,
} from '../../content-engine';

export const DEFINITION_VALIDATION_MODES = {
  CREATE: 'create',
  UPDATE: 'update',
} as const;

export type DefinitionValidationMode =
  (typeof DEFINITION_VALIDATION_MODES)[keyof typeof DEFINITION_VALIDATION_MODES];

export interface DefinitionValidationResult {
  valid: boolean;
  errors: DefinitionValidationError[];
}

/**
 * Schema builder check (SB-10): runs the content-engine validator on a
 * candidate next to the registered definitions. Reads the in-memory
 * registry only; writes nothing. A failed registry load propagates.
 */
@Injectable()
export class DefinitionValidationService {
  constructor(private readonly registry: ContentRegistry) {}

  async validate(input: {
    definition: Record<string, unknown>;
    mode: DefinitionValidationMode;
  }): Promise<DefinitionValidationResult> {
    const registered = (await this.registry.registry()).definitions();
    const slug = input.definition.slug;
    const others =
      input.mode === DEFINITION_VALIDATION_MODES.UPDATE
        ? registered.filter((registeredDefinition) => registeredDefinition.slug !== slug)
        : registered;
    const errors = validateCandidateDefinition(input.definition, others);
    return { valid: errors.length === 0, errors };
  }
}
