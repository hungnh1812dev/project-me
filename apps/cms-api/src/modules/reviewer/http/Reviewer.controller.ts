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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  ClientIpResolver,
  clientMetaOf,
} from '../../../common/http/client-ip.resolver';
import { NO_STORE_HEADER } from '../../../common/constants/http.constants';
import {
  ONE_MINUTE_MS,
  RATE_LIMIT_KEY_SOURCES,
  TEN_MINUTES_MS,
  type RateLimitRule,
} from '../../../common/constants/limits.constants';
import { Throttle } from '../../../common/guards/throttle.guard';
import { parseRequest } from '../../../common/http/request-parsing';
import {
  PermissionAction,
  REVIEWER_SETTINGS_SUBJECT,
  RequirePermission,
  PermissionGuard,
  requireAccountActor,
} from '../../access';
import { type AuthenticatedRequest, JwtAuthGuard } from '../../identity';
import {
  createReviewerSessionSchema,
  reviewerSettingsSchema,
} from './Reviewer.requests';
import type {
  CreatedReviewerSessionView,
  ReviewerSessionPage,
  ReviewerStatusView,
} from '../domain/ReviewerAdmission.rules';
import { ReviewerAccessService } from '../application/ReviewerAccess.service';
import { pageQuerySchema } from '../../../common/validation/SharedSchemas.rules';

/** SPEC §9 reviewer. */
const REVIEWER_ROUTES = {
  ROOT: 'reviewer',
  STATUS: 'status',
  SESSIONS: 'sessions',
  SETTINGS: 'settings',
} as const;

export const REVIEWER_RATE_LIMIT_POLICIES = {
  /** `GET /reviewer/status`: public, one small read. In memory. */
  REVIEWER_STATUS: [
    {
      name: 'reviewer-status:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 120,
      windowMs: ONE_MINUTE_MS,
    },
  ],
  /**
   * `POST /reviewer/sessions`: bounds Turnstile calls and body parsing
   * per IP. The binding rule (1 session per IP per 10 min) lives in the DB.
   */
  REVIEWER_SESSION_ATTEMPTS: [
    {
      name: 'reviewer-session:ip',
      keySource: RATE_LIMIT_KEY_SOURCES.IP,
      maxHits: 20,
      windowMs: TEN_MINUTES_MS,
    },
  ],
} as const satisfies Record<string, readonly RateLimitRule[]>;

/**
 * SPEC §9 reviewer. `status` and `sessions` (POST) are public: the
 * visitor has no account yet. The owner routes need a JWT session and the
 * `reviewer_settings` permission (owner only by default).
 */
@Controller(REVIEWER_ROUTES.ROOT)
export class ReviewerController {
  constructor(
    private readonly reviewer: ReviewerAccessService,
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
    @Body() body: unknown,
  ): Promise<CreatedReviewerSessionView> {
    const input = parseRequest(createReviewerSessionSchema, body);
    const meta = clientMetaOf(this.clientIp, req);
    return this.reviewer.createSession(input, meta.ip, meta.userAgent);
  }

  @Get(REVIEWER_ROUTES.SESSIONS)
  @Header(NO_STORE_HEADER.NAME, NO_STORE_HEADER.VALUE)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission({
    action: PermissionAction.read,
    subject: REVIEWER_SETTINGS_SUBJECT,
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
    subject: REVIEWER_SETTINGS_SUBJECT,
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
