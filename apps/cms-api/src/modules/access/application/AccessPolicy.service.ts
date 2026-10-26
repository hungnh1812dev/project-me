import { Injectable } from '@nestjs/common';

import { ContentRegistry } from '../../content-engine';
import type { ContentTypeRegistry } from '../../content-engine';
import { PolicyEvaluator } from '../domain/PolicyEvaluator.rules';
import { SubjectCatalog } from '../domain/SubjectCatalog.rules';

export interface AccessPolicy {
  catalog: SubjectCatalog;
  evaluator: PolicyEvaluator;
}

/**
 * The app's `SubjectCatalog` and `PolicyEvaluator`, built from the content
 * registry once it is loaded (lazily, see ContentRegistry).
 */
@Injectable()
export class AccessPolicyService {
  private built:
    { registry: ContentTypeRegistry; policy: AccessPolicy } | undefined;

  constructor(private readonly registry: ContentRegistry) {}

  async policy(): Promise<AccessPolicy> {
    const registry = await this.registry.registry();
    if (this.built?.registry !== registry) {
      const catalog = new SubjectCatalog(registry);
      this.built = {
        registry,
        policy: { catalog, evaluator: new PolicyEvaluator(catalog) },
      };
    }
    return this.built.policy;
  }
}
