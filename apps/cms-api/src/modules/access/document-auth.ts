/**
 * Facade of the document-auth part of access. Separate from `index.ts` on
 * purpose: identity imports `index.ts`, and this part imports identity.
 */
export { DocumentAuthGuard, type DocumentRequest } from './document-auth.guard';
export { DocumentAuthModule } from './document-auth.module';
