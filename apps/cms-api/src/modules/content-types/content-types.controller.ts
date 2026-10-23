import { Controller, Get, Header, Param, Req, UseGuards } from '@nestjs/common';

import { API_ROUTES, SLUG_PARAM } from '../../common/constants/api.constants';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../identity/jwt.strategy';
import type { ContentTypeView } from './content-type.view';
import { ContentTypesService } from './content-types.service';

/**
 * SPEC §9 content types (T17b), read-only. No `@RequirePermission`: the
 * subject is per type, so the service filters by `read` on each slug and
 * answers 404 for a type the caller cannot read.
 */
@Controller(API_ROUTES.CONTENT_TYPES.ROOT)
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

  @Get(API_ROUTES.CONTENT_TYPES.BY_SLUG)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  get(
    @Req() req: AuthenticatedRequest,
    @Param(SLUG_PARAM) slug: string,
  ): Promise<ContentTypeView> {
    return this.contentTypes.get(req.user.actor, slug);
  }
}
