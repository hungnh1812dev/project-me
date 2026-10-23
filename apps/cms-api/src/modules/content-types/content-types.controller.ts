import { Controller, Get, Header, Param, Req, UseGuards } from '@nestjs/common';

import { SLUG_PARAM } from '../../common/constants/api.constants';
import { CONTENT_TYPES_ROUTES } from './content-types.routes';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import { type AuthenticatedRequest, JwtAuthGuard } from '../identity';
import type { ContentTypeView } from './content-type.view';
import { ContentTypesService } from './content-types.service';

/**
 * SPEC §9 content types (T17b), read-only. No `@RequirePermission`: the
 * subject is per type, so the service filters by `read` on each slug and
 * answers 404 for a type the caller cannot read.
 */
@Controller(CONTENT_TYPES_ROUTES.ROOT)
@UseGuards(JwtAuthGuard)
export class ContentTypesController {
  constructor(private readonly contentTypes: ContentTypesService) {}

  @Get()
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  async list(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ data: ContentTypeView[] }> {
    return { data: await this.contentTypes.list(req.user.actor) };
  }

  @Get(CONTENT_TYPES_ROUTES.BY_SLUG)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  get(
    @Req() req: AuthenticatedRequest,
    @Param(SLUG_PARAM) slug: string,
  ): Promise<ContentTypeView> {
    return this.contentTypes.get(req.user.actor, slug);
  }
}
