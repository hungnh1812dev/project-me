import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ClientIpResolver } from '../../common/http/client-ip.resolver';
import { REVIEWER_ROUTES } from './reviewer.routes';
import { NO_STORE_HEADER } from '../../common/constants/http.constants';
import { RETRY_AFTER_HEADER } from '../../common/constants/limits.constants';
import { Throttle } from '../../common/guards/throttle.guard';
import { REVIEWER_RATE_LIMIT_POLICIES } from './reviewer.rate-limits.constants';
import { PermissionAction } from '../../generated/prisma/client';
import {
  pageQuerySchema,
  parseRequest,
} from '../../common/http/request-parsing';
import {
  RequirePermission,
  PermissionGuard,
  requireAccountActor,
} from '../access';
import { clientMetaOf } from '../../common/http/client-meta';
import { type AuthenticatedRequest, JwtAuthGuard } from '../identity';
import {
  createReviewerSessionSchema,
  reviewerSettingsSchema,
} from './reviewer.requests';
import {
  type CreatedReviewerSessionView,
  ReviewerIpLimitedException,
  type ReviewerSessionPage,
  ReviewerService,
  type ReviewerStatusView,
} from './reviewer.service';

const SETTINGS_SUBJECT = 'reviewer_settings';

/**
 * SPEC §9 reviewer (T31). `status` and `sessions` (POST) are public: the
 * visitor has no account yet. The owner routes need a JWT session and the
 * `reviewer_settings` permission (owner only by default).
 */
@Controller(REVIEWER_ROUTES.ROOT)
export class ReviewerController {
  constructor(
    private readonly reviewer: ReviewerService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  @Get(REVIEWER_ROUTES.STATUS)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(REVIEWER_RATE_LIMIT_POLICIES.REVIEWER_STATUS)
  status(): Promise<ReviewerStatusView> {
    return this.reviewer.status();
  }

  /** 201 with a 24 h access token, shown once. Turnstile is verified server-side. */
  @Post(REVIEWER_ROUTES.SESSIONS)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @Throttle(REVIEWER_RATE_LIMIT_POLICIES.REVIEWER_SESSION_ATTEMPTS)
  async createSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ): Promise<CreatedReviewerSessionView> {
    const input = parseRequest(createReviewerSessionSchema, body);
    const meta = clientMetaOf(this.clientIp, req);
    try {
      return await this.reviewer.createSession(input, meta.ip, meta.userAgent);
    } catch (error) {
      if (error instanceof ReviewerIpLimitedException) {
        res.setHeader(RETRY_AFTER_HEADER, String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Get(REVIEWER_ROUTES.SESSIONS)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission({
    action: PermissionAction.read,
    subject: SETTINGS_SUBJECT,
  })
  listSessions(
    @Req() req: AuthenticatedRequest,
    @Query() query: unknown,
  ): Promise<ReviewerSessionPage> {
    requireAccountActor(req.user.actor);
    return this.reviewer.listSessions(parseRequest(pageQuerySchema, query));
  }

  @Put(REVIEWER_ROUTES.SETTINGS)
  @HttpCode(HttpStatus.OK)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission({
    action: PermissionAction.update,
    subject: SETTINGS_SUBJECT,
  })
  updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ReviewerStatusView> {
    return this.reviewer.updateSettings(
      requireAccountActor(req.user.actor),
      parseRequest(reviewerSettingsSchema, body),
      clientMetaOf(this.clientIp, req),
    );
  }
}
