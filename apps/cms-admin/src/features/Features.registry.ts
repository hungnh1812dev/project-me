import { accessFeature } from './access/Access.feature';
import { authFeature } from './auth/Auth.feature';
import { contentFeature } from './content/Content.feature';
import { contentTypesFeature } from './content-types/ContentTypes.feature';
import type { Feature } from '../lib/FeatureDefinition';
import { mediaFeature } from './media/Media.feature';
import { reviewerFeature } from './reviewer/Reviewer.feature';
import { securityFeature } from './security/Security.feature';
import { statusFeature } from './status/Status.feature';

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
