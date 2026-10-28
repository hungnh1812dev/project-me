/**
 * Facade of the document-auth part of access. Separate from `index.ts` on
 * purpose: identity imports `index.ts`, and this part imports identity.
 */
export {
  DocumentAuthGuard,
  type DocumentRequest,
} from './http/DocumentAuth.guard';
export { DocumentAuthModule } from './DocumentAuth.module';
