import { accessFeature } from './access/feature';
import { authFeature } from './auth/Auth.feature';
import { contentFeature } from './content/feature';
import { contentTypesFeature } from './content-types/feature';
import type { Feature } from '../lib/FeatureDefinition';
import { mediaFeature } from './media/feature';
import { reviewerFeature } from './reviewer/feature';
import { securityFeature } from './security/Security.feature';
import { statusFeature } from './status/feature';

/**
 * Every feature folder, keyed by folder name. Adding a feature is one line
 * here; the nav order follows this order.
 */
export const FEATURES: Readonly<Record<string, Feature>> = {
  auth: authFeature,
  status: statusFeature,
  access: accessFeature,
  media: mediaFeature,
  reviewer: reviewerFeature,
  content: contentFeature,
  'content-types': contentTypesFeature,
  security: securityFeature,
};

export const FEATURE_LIST: readonly Feature[] = Object.values(FEATURES);
