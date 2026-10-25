import { Injectable } from '@nestjs/common';

import { ContentRegistryProvider } from '../content-engine';
import type { RegistryService } from '../content-engine';
import { PolicyEvaluator } from './domain/PolicyEvaluator';
import { SubjectCatalog } from './domain/SubjectCatalog.rules';

export interface AccessPolicy {
  catalog: SubjectCatalog;
  evaluator: PolicyEvaluator;
}

/**
 * The app's `SubjectCatalog` and `PolicyEvaluator`, built from the content
 * registry once it is loaded (lazily, see ContentRegistryProvider).
 */
@Injectable()
export class AccessPolicyService {
  private built:
    { registry: RegistryService; policy: AccessPolicy } | undefined;

  constructor(private readonly registry: ContentRegistryProvider) {}

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
